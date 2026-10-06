//////////////////////////////////////////////////////////////////////////////
//
//  Angel.js
//
//////////////////////////////////////////////////////////////////////////////

//----------------------------------------------------------------------------
//
//  Types
//

type Vec2 = [x: number, y: number];
type Vec3 = [x: number, y: number, z: number];
type Vec4 = [x: number, y: number, z: number, w: number];
type VecN = Vec2 | Vec3 | Vec4;

type Mat2 = [[number, number], [number, number]] & { matrix: true; };
type Mat3 = [[number, number, number], [number, number, number], [number, number, number]] & { matrix: true; };
type Mat4 = [[number, number, number, number], [number, number, number, number], [number, number, number, number], [number, number, number, number]] & { matrix: true; };
type MatN = Mat2 | Mat3 | Mat4;

type VecMat = VecN | MatN;

//----------------------------------------------------------------------------
//
//  Helper functions
//

export function radians(degrees: number): number;

//----------------------------------------------------------------------------
//
//  Vector Constructors
//

export function vec2(...coords: number): Vec2;
export function vec3(...coords: number): Vec3;
export function vec4(...coords: number): Vec4;

//----------------------------------------------------------------------------
//
//  Matrix Constructors
//

export function mat2(...elems: number): Mat2;
export function mat3(...elems: number): Mat3;
export function mat4(...elems: number): Mat4;

//----------------------------------------------------------------------------
//
//  Generic Mathematical Operations for Vectors and Matrices
//

export function equal(u: VecMat, v: VecMat): boolean;

export function add<T extends VecMat>(u: T, v: T): T;

export function subtract<T extends VecMat>(u: T, v: T): T;

export function mult(u: Mat2, v: Mat2): Mat2;
export function mult(u: Mat3, v: Mat3): Mat3;
export function mult(u: Mat4, v: Mat4): Mat4;
export function mult(u: Mat2, v: Vec2): Vec2;
export function mult(u: Mat3, v: Vec3): Vec3;
export function mult(u: Mat4, v: Vec4): Vec4;
export function mult(u: Vec2, v: Vec2): Vec2;
export function mult(u: Vec3, v: Vec3): Vec3;
export function mult(u: Vec4, v: Vec4): Vec4;

//----------------------------------------------------------------------------
//
//  Basic Transformation Matrix Generators
//

export function translate(v: Vec3): Mat4;
export function translate(x: number, y: number, z: number): Mat4;

//----------------------------------------------------------------------------

export function rotate(angle: number, axis: Vec3): Mat4;
export function rotate(angle: number, x: number, y: number, z: number): Mat4;

export function rotateX(theta: number): Mat4;
export function rotateY(theta: number): Mat4;
export function rotateZ(theta: number): Mat4;


//----------------------------------------------------------------------------

export function scalem(v: Vec3): Mat4;
export function scalem(x: number, y: number, z: number): Mat4;

//----------------------------------------------------------------------------
//
//  ModelView Matrix Generators
//

export function lookAt(eye: Vec3, at: Vec3, up: Vec3): Mat4;

//----------------------------------------------------------------------------
//
//  Projection Matrix Generators
//

export function ortho(left: number, right: number, bottom: number, top: number, near: number, far: number): Mat4;

export function perspective(fovy: number, aspect: number, near: number, far: number): Mat4;

//----------------------------------------------------------------------------
//
//  Matrix Functions
//

export function transpose<T extends MatN>(m: T): T;

//----------------------------------------------------------------------------
//
//  Vector Functions
//

export function dot<T extends VecN>(u: T, v: T): number;

export function negate<T extends VecN>(u: T): T;

export function cross(u: Vec3 | Vec4, v: Vec3 | Vec4): Vec3;

export function length<T extends VecN>(u: T): number;

export function normalize<T extends VecN>(u: T, excludeLastComponent: boolean = false): T;

export function mix<T extends VecN>(u: T, v: T, s: number): T;

export function scale<T extends VecN>(s: number, u: T): T;

//----------------------------------------------------------------------------
//
// Utility
//

export function flatten(v: VecMat): Float32Array;

//----------------------------------------------------------------------------

export const sizeof: {
	vec2: 8, vec3: 12, vec4: 16,
	mat2: 16, mat3: 36, mat4: 64,
};

//----------------------------------------------------------------------------
//
// Printing
//

export function printm(m: MatN);

//----------------------------------------------------------------------------
//
// Determinants
//

export function det2(m: Mat2): number;
export function det3(m: Mat3): number;
export function det4(m: Mat4): number;
export function det(m: MatN): number;

//----------------------------------------------------------------------------
//
// Inverses
//

export function inverse2(m: Mat2): Mat2;
export function inverse3(m: Mat3): Mat3;
export function inverse4(m: Mat4): Mat4;
export function inverse<T extends MatN>(m: T): T;

export function normalMatrix<T extends MatN>(m: T, flag: false): T;
export function normalMatrix(m: Mat3 | Mat4, flag: true): Mat3;
