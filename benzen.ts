import { watch } from 'chokidar'
import {
	readFileSync as read,
	writeFileSync as write,
	appendFileSync as append,
	existsSync as exists,
	mkdirSync as mkdir,
	copyFileSync as copy,
	constants as fs,
} from 'fs'
import { resolve } from 'path'
import { createInterface } from 'readline'
import { default as crowd } from 'hyoo_crowd_lib'
import { default as tree } from 'mol_tree2'

const docs = new Map< string, crowd.$hyoo_crowd_doc >()

function execute( script: tree.$mol_tree2 ) {
	
	for( const command of script.kids ) {
		
		switch( command.type ) {
			
			case 'store': return store( command.kids[0].type )
			case 'restore': return restore( command.kids[0].type )
			case 'merge': return merge( command.kids[0].type )
			
			default: throw command.error( 'Unsupported command' )
			
		}
		
	}
	
}

function store( name: string ) {
	
	if( !name ) throw new Error( 'Undefined snapshot name' )
	
	for( const path of docs.keys() ) {
		
		const source = resolve( '.bz/current', path )
		const target = resolve( '.bz/snapshot', name, path )
		
		mkdir( resolve( target, '..' ), { recursive: true } )
		copy( source, target, fs.COPYFILE_FICLONE )
		
	}
	
}

function restore( name: string ) {
	
	if( !name ) throw new Error( 'Undefined snapshot name' )
	
	for( const path of docs.keys() ) {
		
		const target = resolve( '.bz/current', path )
		const source = resolve( '.bz/snapshot', name, path )
		
		mkdir( resolve( target, '..' ), { recursive: true } )
		copy( source, target, fs.COPYFILE_FICLONE )
		
		let doc = load( target )
		docs.set( path, doc )
		
		const content = doc.root.sub( 'content' ).text()
		
		mkdir( resolve( path, '..' ), { recursive: true } )
		write( path, content )
		
	}
	
}

function merge( name: string ) {
	
	if( !name ) throw new Error( 'Undefined snapshot name' )
	
	for( const path of docs.keys() ) {
		
		const target = resolve( '.bz/current', path )
		const source = resolve( '.bz/snapshot', name, path )
		
		let doc = docs.get( path )!
		const from = new crowd.$hyoo_crowd_clock( doc.clock )
		
		const delta = load( source ).delta( from )
		doc.apply( delta )
		save( target, delta )
		
		const content = doc.root.sub( 'content' ).text()
		mkdir( resolve( path, '..' ), { recursive: true } )
		write( path, content )
		
	}
	
}

function load( path: string ) {
	
	const doc = new crowd.$hyoo_crowd_doc
	
	const source = resolve( '.bz/current', path )
	if( !exists( source ) ) return doc
		
	const bin = new Uint8Array( read( source ) ).buffer
	let offset = 0
	
	while( offset < bin.byteLength ) {
		
		const size = new Uint32Array( bin, offset, 1 )[0]
		offset += 4

		const chunk = crowd.$hyoo_crowd_chunk_unpack( new Uint8Array( bin, offset, size ) )
		offset += size
		
		doc.apply([ chunk ])
		
	}
	
	return doc
}

function save( path: string, delta: readonly crowd.$hyoo_crowd_chunk[] ) {
	
	for( const chunk of delta ) {
		const packed = crowd.$hyoo_crowd_chunk_pack( chunk )
		append( path, new Uint8Array( new Uint32Array([ packed.length ]).buffer ) )
		append( path, packed )
	}
	
}

const terminal = createInterface({
	input: process.stdin,
	output: process.stdout,
	history: [ 'help', 'snapshot ' ],
	tabSize: 4,
	prompt: '',
})

terminal.prompt()

let script_buffer = ''

terminal
.on( 'line', line => {
	
	if( line ) {
		
		script_buffer += line + '\n'
		
	} else {
		
		if( !script_buffer ) return
		
		try {
			
			const script = tree.$mol_tree2_from_string( script_buffer, 'input' )
			execute( script )
			
		} catch( error: any ) {
			
			const response = tree.$mol_tree2.struct( 'error', [
				tree.$mol_tree2.data( error.message )
			])
			
			process.stderr.write( response.toString() )
			
		}
		
		script_buffer = ''
		terminal.prompt()
		
	}
	
})
.on( 'close', () => process.exit(0) )

const watcher = watch( '.' , {
	persistent: true ,
	ignored: /(^\..|___$)/,
	ignoreInitial: false,
	awaitWriteFinish: {
		stabilityThreshold: 100,
	},
} )

watcher
.on( 'error' , console.error )
.on( 'all' , ( type , path )=> {
	
	// const response = tree.$mol_tree2.struct( type, [
	// 	tree.$mol_tree2.data( path )
	// ])
	// process.stdout.write( response.toString() )

	if( type === 'addDir' ) return
	if( /\.bz/.test( path ) ) return
	
	const path_inner = resolve( '.bz/current', path )
	mkdir( resolve( path_inner, '..' ), { recursive: true } )
	
	let doc = docs.get( path )
	if( !doc ) docs.set( path, doc = load( path_inner ) )
	
	const from = new crowd.$hyoo_crowd_clock( doc.clock )
	
	const content = read( path, { encoding: 'utf-8' } )
	doc.root.sub( 'content' ).text( content )
	
	const delta = doc.delta( from )
	save( path_inner, delta )
	
} )
