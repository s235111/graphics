struct Uniforms {
	theta: f32,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VSOut {
	@builtin(position) position: vec4f,
	@location(0) color: vec3f,
}

@vertex
fn main_vs(@location(0) pos: vec2f, @location(1) color: vec3f) -> VSOut {
	var out: VSOut;
	let c = cos(uniforms.theta);
	let s = sin(uniforms.theta);
	let rot = mat2x2f(c, s, -s, c);
	out.position = vec4f(rot * pos, 0, 1);
	out.color = color;
	return out;
}

@fragment
fn main_fs(@location(0) color: vec3f) -> @location(0) vec4f {
	return vec4f(color, 1.0);
}
