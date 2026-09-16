const TAU = 6.283185307179586;

struct Uniforms {
	mvp: array<mat4x4f, 3>,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn main_vs(@location(0) pos: vec4f, @builtin(instance_index) instance: u32) -> @builtin(position) vec4f {
	return uniforms.mvp[instance] * pos;
}

@fragment
fn main_fs() -> @location(0) vec4f {
	return vec4f(0.0, 0.0, 0.0, 1.0);
}
