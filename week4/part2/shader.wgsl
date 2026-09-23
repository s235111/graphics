const TAU = 6.283185307179586;

struct Uniforms {
	mvp: mat4x4f,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VSOut {
	@builtin(position) pos: vec4f,
	@location(0) world_pos: vec4f,
}

@vertex
fn main_vs(@location(0) pos: vec4f) -> VSOut {
	var out: VSOut;
	out.pos = uniforms.mvp * pos;
	out.world_pos = pos;
	return out;
}

@fragment
fn main_fs(@location(0) pos: vec4f) -> @location(0) vec4f {
	return vec4f(pos.xyz * 0.5 + vec3f(0.5), 1.0);
}
