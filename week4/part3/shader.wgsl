const TAU = 6.283185307179586;

struct Uniforms {
	model: mat4x4f,
	view: mat4x4f,
	proj: mat4x4f,
}
@group(0) @binding(0) var<uniform> u: Uniforms;

const kd = vec3f(0.5, 0.25, 1.0);
const le = vec4f(0, 0, -1, 0);
const Le = vec3f(1, 1, 1);

struct VSOut {
	@builtin(position) pos: vec4f,
	@location(0) world_pos: vec4f,
	@location(1) color: vec3f,
}

@vertex
fn main_vs(@location(0) pos: vec4f, @location(1) normal: vec4f) -> VSOut {
	const V = 1;
	const Li = V * Le;
	const ωi = -le;
	let Lrd = kd * Li * max(dot(normal, ωi), 0.0);

	var out: VSOut;
	out.pos = u.proj * u.view * u.model * pos;
	out.world_pos = pos;
	out.color = Lrd;
	return out;
}

@fragment
fn main_fs(@location(0) pos: vec4f, @location(1) color: vec3f) -> @location(0) vec4f {
	return vec4f(color, 1.0);
}
