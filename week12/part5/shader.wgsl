const TAU = 6.283185307179586;

struct Uniforms {
	ball_pos: vec2f,
	ball_squish: vec2f,
	ball_rot: mat2x2f,
	flatness: f32,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VSOut {
	@builtin(position) position: vec4f,
	@location(0) color: vec3f,
}

@vertex
fn main_vs(@location(0) pos: vec2f, @location(1) color: vec3f) -> VSOut {
	var out: VSOut;
	var s = uniforms.ball_squish;
	var p = uniforms.ball_pos;
	if (s.y < 1) {
		p.y = -1 + 0.5 * (1 + (s.y - 1) * (1 + uniforms.flatness * sqrt(1.5)));
		s -= vec2f(1, 1);
		s *= 1 + uniforms.flatness * sqrt(1 - pos.y);
		s += vec2f(1, 1);
	}
	out.position = vec4f(uniforms.ball_rot * (s * pos) + p, 0, 1);
	out.color = color;
	return out;
}

@fragment
fn main_fs(@location(0) color: vec3f) -> @location(0) vec4f {
	return vec4f(color, 1.0);
}
