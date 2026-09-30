// OBJParser.js from OBJViewer.js (c) 2012 matsuda and itami
//
// Modified by Jeppe Revall Frisvad, 2014, in order to
// - enable loading of OBJ files with no object or group names,
// - enable loading of files with different white spaces and returns at the end
//   of the face definitions, and
// - enable loading of larger models by improving the function getDrawingInfo.
// Modified by Jeppe Revall Frisvad 2024, in order to
// - use fetch for asynchronous data loading.
// Modified by Christian Livbjerg Worsøe 2026, in order to
// - convert to ESM,
// - use ES6 classes instead of functions and prototype, and
// - modernise and clean up syntax.

//------------------------------------------------------------------------------
// OBJParser
//------------------------------------------------------------------------------

export async function readOBJFile(fileName, scale, reverse, wireframe) {
	const response = await fetch(fileName);
	if (!response.ok) return null;
	const objDoc = new OBJDoc(fileName);
	const fileText = await response.text();
	const result = await objDoc.parse(fileText, scale, reverse);
	if (!result) {
		console.error("OBJ file parsing error");
		return null;
	}
	return wireframe ? objDoc.getWireDrawingInfo() : objDoc.getDrawingInfo();
}

//------------------------------------------------------------------------------
// OBJDoc
//------------------------------------------------------------------------------
export class OBJDoc {
	constructor(fileName) {
		this.fileName = fileName;
		this.mtls = [];
		this.objects = [];
		this.vertices = [];
		this.normals = [];
	};

	// Parsing the OBJ file
	async parse(fileString, scale, reverse) {
		let currentObject = new OBJObject("");
		this.objects.push(currentObject);
		let currentMaterialName = "";

		// Parse line by line
		const sp = new StringParser();
		for (const line of fileString.split("\n")) {
			sp.init(line);                 // Init StringParser
			const command = sp.getWord();  // Get command
			if (command == null) continue; // Check null command

			switch (command) {
				case "#":
					continue; // Skip comments
				case "mtllib": // Read material chunk
					const path = this.parseMtllib(sp, this.fileName);
					const mtl = new MTLDoc();
					this.mtls.push(mtl);
					const response = await fetch(path);
					if (response.ok) {
						this.#onReadMTLFile(await response.text(), mtl);
					} else {
						mtl.complete = true;
					}
					continue; // Go to the next line
				case "o":
				case "g": // Read object name
					currentObject = this.parseObjectName(sp);
					this.objects.push(currentObject);
					continue; // Go to the next line
				case "v": // Read vertex
					const vertex = this.parseVertex(sp, scale);
					this.vertices.push(vertex);
					continue; // Go to the next line
				case "vn": // Read normal
					const normal = this.parseNormal(sp);
					this.normals.push(normal);
					continue; // Go to the next line
				case "usemtl": // Read material name
					currentMaterialName = this.parseUsemtl(sp);
					continue; // Go to the next line
				case "f": // Read face
					const face = this.parseFace(sp, currentMaterialName, this.vertices, reverse);
					currentObject.addFace(face);
					continue; // Go to the next line
			}
		}

		return true;
	}

	parseMtllib(sp, fileName) {
		// Get directory path
		const i = fileName.lastIndexOf("/");
		const dirPath = fileName.slice(0, i + 1);
		const path = sp.getWord();
		return dirPath + path;
	}

	parseObjectName(sp) {
		const name = sp.getWord();
		return new OBJObject(name);
	}

	parseVertex(sp, scale) {
		const x = sp.getFloat() * scale;
		const y = sp.getFloat() * scale;
		const z = sp.getFloat() * scale;
		return new Vertex(x, y, z);
	}

	parseNormal(sp) {
		const x = sp.getFloat();
		const y = sp.getFloat();
		const z = sp.getFloat();
		return new Normal(x, y, z);
	}

	parseUsemtl(sp) {
		return sp.getWord();
	}

	parseFace(sp, materialName, vertices, reverse) {
		const face = new Face(materialName);

		// Get indices
		while (true) {
			const word = sp.getWord();
			if (word == null) break;
			const subWords = word.split('/');
			if (subWords.length >= 1) {
				const vi = parseInt(subWords[0]) - 1;
				if (!isNaN(vi)) face.vIndices.push(vi);
			}
			if (subWords.length >= 3) {
				const ni = parseInt(subWords[2]) - 1;
				face.nIndices.push(ni);
			} else {
				face.nIndices.push(-1);
			}
		}

		// Calculate normal
		const v0 = [
			vertices[face.vIndices[0]].x,
			vertices[face.vIndices[0]].y,
			vertices[face.vIndices[0]].z];
		const v1 = [
			vertices[face.vIndices[1]].x,
			vertices[face.vIndices[1]].y,
			vertices[face.vIndices[1]].z];
		const v2 = [
			vertices[face.vIndices[2]].x,
			vertices[face.vIndices[2]].y,
			vertices[face.vIndices[2]].z];

		// 面の法線を計算してnormalに設定
		let normal = calcNormal(v0, v1, v2);
		// 法線が正しく求められたか調べる
		if (normal == null) {
			if (face.vIndices.length >= 4) { // 面が四角形なら別の3点の組み合わせで法線計算
				const v3 = [
					vertices[face.vIndices[3]].x,
					vertices[face.vIndices[3]].y,
					vertices[face.vIndices[3]].z];
				normal = calcNormal(v1, v2, v3);
			}
			if (normal == null) {         // 法線が求められなかったのでY軸方向の法線とする
				normal = new Float32Array([0, 1, 0]);
			}
		}
		if (reverse) {
			normal[0] = -normal[0];
			normal[1] = -normal[1];
			normal[2] = -normal[2];
		}
		face.normal = new Normal(...normal);

		// Split to triangles if face contains more than 3 vertices
		if (face.vIndices.length > 3) {
			const n = face.vIndices.length - 2;
			const newVIndices = new Array(n * 3);
			const newNIndices = new Array(n * 3);
			for (let i = 0; i < n; i++) {
				newVIndices[i * 3 + 0] = face.vIndices[0];
				newVIndices[i * 3 + 1] = face.vIndices[i + 1];
				newVIndices[i * 3 + 2] = face.vIndices[i + 2];
				newNIndices[i * 3 + 0] = face.nIndices[0];
				newNIndices[i * 3 + 1] = face.nIndices[i + 1];
				newNIndices[i * 3 + 2] = face.nIndices[i + 2];
			}
			face.vIndices = newVIndices;
			face.nIndices = newNIndices;
		}
		face.numIndices = face.vIndices.length;

		return face;
	}

	// Analyse the material file
	#onReadMTLFile(fileString, mtl) {
		let name = ""; // Material name

		// Parse line by line
		const sp = new StringParser();
		for (const line of fileString.split("\n")) {
			sp.init(line);                 // Init StringParser
			const command = sp.getWord();  // Get command
			if (command == null) continue; // Check null command

			switch (command) {
				case "#":
					continue; // Skip comments
				case "newmtl": // Read material name
					name = mtl.parseNewmtl(sp);
					continue; // Go to the next line
				case "Kd": // Read diffuse colour coefficient as colour
					if (name == "") continue; // Go to the next line because of Error
					const material = mtl.parseRGB(sp, name);
					mtl.materials.push(material);
					name = "";
					continue; // Go to the next line
			}
		}
		mtl.complete = true;
	}

	// Check materials
	isMTLComplete() {
		return this.mtls.every(mtl => mtl.complete);
	}

	// Find colour by material name
	findColor(name) {
		for (const mtl of this.mtls) {
			for (const material of mtl.materials) {
				if (material.name == name) {
					return material.color;
				}
			}
		}
		return new Color(0.8, 0.8, 0.8, 1);
	}

	//------------------------------------------------------------------------------
	// Retrieve the information for drawing 3D model
	getDrawingInfo() {
		// Create arrays for vertex coordinates, normals, colours, and indices
		const numIndices = this.objects.reduce((sum, object) => sum + object.numIndices, 0);
		const numVertices = this.vertices.length;
		const vertices = new Float32Array(numVertices * 4);
		const normals = new Float32Array(numVertices * 4);
		const colors = new Float32Array(numVertices * 4);
		const indices = new Uint32Array(numIndices);

		// Set vertex, normal, and colour
		let iIdx = 0;
		for (const object of this.objects) {
			for (const face of object.faces) {
				const color = this.findColor(face.materialName);
				const faceNormal = face.normal;
				for (let i = 0; i < face.vIndices.length; i++) {
					// Set index
					const vIdx = face.vIndices[i];
					indices[iIdx] = vIdx;
					// Copy vertex
					const vertex = this.vertices[vIdx];
					vertices[vIdx * 4 + 0] = vertex.x;
					vertices[vIdx * 4 + 1] = vertex.y;
					vertices[vIdx * 4 + 2] = vertex.z;
					vertices[vIdx * 4 + 3] = 1;
					// Copy colour
					colors[vIdx * 4 + 0] = color.r;
					colors[vIdx * 4 + 1] = color.g;
					colors[vIdx * 4 + 2] = color.b;
					colors[vIdx * 4 + 3] = color.a;
					// Copy normal
					const nIdx = face.nIndices[i];
					if (nIdx >= 0) {
						const normal = this.normals[nIdx];
						normals[vIdx * 4 + 0] = normal.x;
						normals[vIdx * 4 + 1] = normal.y;
						normals[vIdx * 4 + 2] = normal.z;
						normals[vIdx * 4 + 3] = 0;
					} else {
						normals[vIdx * 4 + 0] = faceNormal.x;
						normals[vIdx * 4 + 1] = faceNormal.y;
						normals[vIdx * 4 + 2] = faceNormal.z;
						normals[vIdx * 4 + 3] = 0;
					}
					iIdx++;
				}
			}
		}

		return new DrawingInfo(vertices, normals, colors, indices);
	}

	//------------------------------------------------------------------------------
	// Retrieve the information for drawing 3D model with wireframe
	getWireDrawingInfo() {
		// Create arrays for vertex coordinates, normals, colours, barycentric coordinates, and indices
		const numIndices = this.objects.reduce((sum, object) => sum + object.numIndices, 0);
		const numVertices = this.vertices.length;
		const vertices = new Float32Array(numVertices * 4);
		const normals = new Float32Array(numVertices * 4);
		const colors = new Float32Array(numVertices * 4);
		const barycoords = new Float32Array(numVertices * 3);
		const indices = new Uint32Array(numIndices);

		// Set vertex, normal, and colour
		let iIdx = 0;
		for (const object of this.objects) {
			for (const face of object.faces) {
				const color = this.findColor(face.materialName);
				const faceNormal = face.normal;
				for (let i = 0; i < face.vIndices.length; i++) {
					// Set index
					const vIdx = face.vIndices[i];
					indices[iIdx] = iIdx;
					// Copy vertex
					const vertex = this.vertices[vIdx];
					vertices[iIdx * 4 + 0] = vertex.x;
					vertices[iIdx * 4 + 1] = vertex.y;
					vertices[iIdx * 4 + 2] = vertex.z;
					vertices[iIdx * 4 + 3] = 1;
					// Copy colour
					colors[iIdx * 4 + 0] = color.r;
					colors[iIdx * 4 + 1] = color.g;
					colors[iIdx * 4 + 2] = color.b;
					colors[iIdx * 4 + 3] = color.a;
					// Copy normal
					const nIdx = face.nIndices[i];
					if (nIdx >= 0) {
						const normal = this.normals[nIdx];
						normals[iIdx * 4 + 0] = normal.x;
						normals[iIdx * 4 + 1] = normal.y;
						normals[iIdx * 4 + 2] = normal.z;
						normals[iIdx * 4 + 3] = 0;
					} else {
						normals[iIdx * 4 + 0] = faceNormal.x;
						normals[iIdx * 4 + 1] = faceNormal.y;
						normals[iIdx * 4 + 2] = faceNormal.z;
						normals[iIdx * 4 + 3] = 0;
					}
					// Set barycentric coordinates
					barycoords[iIdx * 3 + 0] = i % 3 == 0 ? 1 : 0;
					barycoords[iIdx * 3 + 1] = i % 3 == 1 ? 1 : 0;
					barycoords[iIdx * 3 + 2] = i % 3 == 2 ? 1 : 0;
					iIdx++;
				}
			}
		}

		return new WireDrawingInfo(vertices, normals, colors, barycoords, indices);
	}
}

//------------------------------------------------------------------------------
// MTLDoc
//------------------------------------------------------------------------------
export class MTLDoc {
	constructor() {
		this.complete = false; // MTL is configured correctly
		this.materials = [];
	}

	parseNewmtl(sp) {
		return sp.getWord();
	}

	parseRGB(sp, name) {
		const r = sp.getFloat();
		const g = sp.getFloat();
		const b = sp.getFloat();
		return new Material(name, r, g, b, 1);
	}
}

//------------------------------------------------------------------------------
// Material
//------------------------------------------------------------------------------
export class Material {
	constructor(name, r, g, b, a) {
		this.name = name;
		this.color = new Color(r, g, b, a);
	}
}

//------------------------------------------------------------------------------
// Vertex
//------------------------------------------------------------------------------
export class Vertex {
	constructor(x, y, z) {
		this.x = x;
		this.y = y;
		this.z = z;
	}
}

//------------------------------------------------------------------------------
// Normal
//------------------------------------------------------------------------------
export class Normal {
	constructor(x, y, z) {
		this.x = x;
		this.y = y;
		this.z = z;
	}
}

//------------------------------------------------------------------------------
// Color
//------------------------------------------------------------------------------
export class Color {
	constructor(r, g, b, a) {
		this.r = r;
		this.g = g;
		this.b = b;
		this.a = a;
	}
}

//------------------------------------------------------------------------------
// OBJObject
//------------------------------------------------------------------------------
export class OBJObject {
	constructor(name) {
		this.name = name;
		this.faces = [];
		this.numIndices = 0;
	}

	addFace(face) {
		this.faces.push(face);
		this.numIndices += face.numIndices;
	}
}

//------------------------------------------------------------------------------
// Face
//------------------------------------------------------------------------------
export class Face {
	constructor(materialName) {
		this.materialName = materialName ?? "";
		this.vIndices = [];
		this.nIndices = [];
		this.numIndices = 0;
	}
}

//------------------------------------------------------------------------------
// DrawingInfo
//------------------------------------------------------------------------------
export class DrawingInfo {
	constructor(vertices, normals, colors, indices) {
		this.vertices = vertices;
		this.normals = normals;
		this.colors = colors;
		this.indices = indices;
	}
}

//------------------------------------------------------------------------------
// WireDrawingInfo
//------------------------------------------------------------------------------
export class WireDrawingInfo {
	constructor(vertices, normals, colors, barycoords, indices) {
		this.vertices = vertices;
		this.normals = normals;
		this.colors = colors;
		this.barycoords = barycoords;
		this.indices = indices;
	}
}

//------------------------------------------------------------------------------
// StringParser
//------------------------------------------------------------------------------
export class StringParser {
	constructor(str) {
		this.str;   // Store the string specified by the argument
		this.index; // Position in the string to be processed
		this.init(str);
	}

	// Initialise StringParser object
	init(str) {
		this.str = str;
		this.index = 0;
	}

	// Skip delimiters
	skipDelimiters() {
		let i = this.index;
		for (const len = this.str.length; i < len; i++) {
			const c = this.str.charAt(i);
			// Skip TAB, Space, '(', ')'
			if (!"\t ()\"".includes(c)) break;
		}
		this.index = i;
	}

	// Get the length of word
	getWordLength() {
		let i = this.index;
		for (const len = this.str.length; i < len; i++) {
			const c = this.str.charAt(i);
			if ("\t ()\"".includes(c)) break;
		}
		return i - this.index;
	}

	// Skip to the next word
	skipToNextWord() {
		this.skipDelimiters();
		const n = this.getWordLength(this.str, this.index);
		this.index += n + 1;
	}

	// Get word
	getWord() {
		this.skipDelimiters();
		const n = this.getWordLength(this.str, this.index);
		if (n == 0) return null;
		const word = this.str.substr(this.index, n);
		this.index += n + 1;

		return word;
	}

	// Get integer
	getInt() {
		return parseInt(this.getWord());
	}

	// Get floating number
	getFloat() {
		return parseFloat(this.getWord());
	}
}

//------------------------------------------------------------------------------
// Common function
//------------------------------------------------------------------------------
function calcNormal(p0, p1, p2) {
	// v0 is a vector from p1 to p0, v1 is a vector from p1 to p2
	const v0 = new Float32Array(3);
	const v1 = new Float32Array(3);
	for (let i = 0; i < 3; i++) {
		v0[i] = p0[i] - p1[i];
		v1[i] = p2[i] - p1[i];
	}

	// The cross product of v0 and v1
	const c = new Float32Array(3);
	c[0] = v0[1] * v1[2] - v0[2] * v1[1];
	c[1] = v0[2] * v1[0] - v0[0] * v1[2];
	c[2] = v0[0] * v1[1] - v0[1] * v1[0];

	// Normalise the cross product to get the normal
	let g = Math.hypot(...c);
	if (g == 0) {
		c[0] = 0; c[1] = 0; c[2] = 0;
	} else if (g != 1) {
		g = 1 / g;
		c[0] *= g; c[1] *= g; c[2] *= g;
	}
	return c;
}
