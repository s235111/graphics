const TAU = 6.283185307179586;

struct Uniforms {
	ball_pos: vec2f,
	ball_squish: mat2x2f,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VSOut {
	@builtin(position) position: vec4f,
	@location(0) color: vec3f,
}

@vertex
fn main_vs(@location(0) pos: vec2f, @location(1) color: vec3f) -> VSOut {
	var out: VSOut;
	out.position = vec4f(uniforms.ball_squish * pos + uniforms.ball_pos, 0, 1);
	out.color = color;
	return out;
}

@fragment
fn main_fs(@location(0) color: vec3f) -> @location(0) vec4f {
	return vec4f(color, 1.0);
}
