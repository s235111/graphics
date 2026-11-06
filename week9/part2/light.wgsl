struct Uniforms {
	model: mat4x4f,
	lightViewProj: mat4x4f,
}
@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn main_vs(@location(0) pos: vec4f) -> @builtin(position) vec4f {
	return u.lightViewProj * u.model * pos;
}

@fragment
fn main_fs() {}
