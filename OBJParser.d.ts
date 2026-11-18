//------------------------------------------------------------------------------
// OBJParser
//------------------------------------------------------------------------------

export async function readOBJFile(fileName: string, scale: number, reverse: boolean, wireframe: false): Promise<DrawingInfo>;
export async function readOBJFile(fileName: string, scale: number, reverse: boolean, wireframe: true): Promise<WireDrawingInfo>;

//------------------------------------------------------------------------------
// OBJDoc
//------------------------------------------------------------------------------
export class OBJDoc {
	fileName: string;
	mtls: MTLDoc[];
	objects: OBJObject[];
	vertices: Vertex[];
	normals: Normal[];
	texcoords: Texcoord[];
	constructor(fileName: string);

	// Parsing the OBJ file
	async parse(fileString: string, scale: number, reverse: boolean): Promise<boolean>;

	parseMtllib(sp: StringParser, fileName: string): string;
	parseObjectName(sp: StringParser): OBJObject;
	parseVertex(sp: StringParser, scale: number): Vertex;
	parseNormal(sp: StringParser): Normal;
	parseTexcoord(sp: StringParser): Texcoord;
	parseUsemtl(sp: StringParser): string;
	parseFace(sp: StringParser, materialName: string, vertices: Vertex[], reverse: boolean): Face;

	// Check materials
	isMTLComplete(): boolean;

	// Find colour by material name
	findColor(name: string): Color;

	//------------------------------------------------------------------------------
	// Retrieve the information for drawing 3D model
	getDrawingInfo(): DrawingInfo;

	//------------------------------------------------------------------------------
	// Retrieve the information for drawing 3D model with wireframe
	getWireDrawingInfo(): WireDrawingInfo;
}

//------------------------------------------------------------------------------
// MTLDoc
//------------------------------------------------------------------------------
export class MTLDoc {
	complete: boolean;
	materials: Material[];
	constructor();

	parseNewmtl(sp: StringParser): string;
	parseRGB(sp: StringParser, name: string): Material;
}

//------------------------------------------------------------------------------
// Material
//------------------------------------------------------------------------------
export class Material {
	name: string;
	color: Color;
	constructor(name: string, r: number, g: number, b: number, a: number);
}

//------------------------------------------------------------------------------
// Vertex
//------------------------------------------------------------------------------
export class Vertex {
	x: number;
	y: number;
	z: number;
	constructor(x: number, y: number, z: number);
}

//------------------------------------------------------------------------------
// Normal
//------------------------------------------------------------------------------
export class Normal {
	x: number;
	y: number;
	z: number;
	constructor(x: number, y: number, z: number);
}

//------------------------------------------------------------------------------
// Texture Coordinates
//------------------------------------------------------------------------------
export class Texcoord {
	u: number;
	v: number;
	constructor(u: number, v: number);
}

//------------------------------------------------------------------------------
// Color
//------------------------------------------------------------------------------
export class Color {
	r: number;
	g: number;
	b: number;
	a: number;
	constructor(r: number, g: number, b: number, a: number);
}

//------------------------------------------------------------------------------
// OBJObject
//------------------------------------------------------------------------------
export class OBJObject {
	name: string;
	faces: Face[];
	numIndices: number;
	constructor(name: string);

	addFace(face: Face);
}

//------------------------------------------------------------------------------
// Face
//------------------------------------------------------------------------------
export class Face {
	materialName: string;
	vIndices: number[];
	nIndices: number[];
	tIndices: number[];
	numIndices: number;
	constructor(materialName: string);
}

//------------------------------------------------------------------------------
// DrawingInfo
//------------------------------------------------------------------------------
export class DrawingInfo {
	vertices: Float32Array;
	normals: Float32Array;
	texcoords: Float32Array;
	colors: Float32Array;
	indices: Uint32Array;
	constructor(vertices: Float32Array, normals: Float32Array, texcoords: Float32Array, colors: Float32Array, indices: Uint32Array);
}

//------------------------------------------------------------------------------
// WireDrawingInfo
//------------------------------------------------------------------------------
export class WireDrawingInfo {
	vertices: Float32Array;
	normals: Float32Array;
	texcoords: Float32Array;
	colors: Float32Array;
	barycoords: Float32Array;
	indices: Uint32Array;
	constructor(vertices: Float32Array, normals: Float32Array, texcoords: Float32Array, colors: Float32Array, barycoords: Float32Array, indices: Uint32Array);
}

//------------------------------------------------------------------------------
// StringParser
//------------------------------------------------------------------------------
export class StringParser {
	str: string;
	index: number;
	constructor(str: string);

	// Initialise StringParser object
	init(str: string);

	// Skip delimiters
	skipDelimiters();

	// Get the length of word
	getWordLength(): number;

	// Skip to the next word
	skipToNextWord();

	// Get word
	getWord(): string | null;

	// Get integer
	getInt(): number;

	// Get floating number
	getFloat(): number;
}
