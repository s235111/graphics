const TAU = 6.283185307179586;

struct Uniforms {
	model: mat4x4f,
	view: mat4x4f,
	proj: mat4x4f,
}
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
	@builtin(position) pos: vec4f,
	@location(0) world_normal: vec4f,
}

@vertex
fn main_vs(@location(0) pos: vec4f, @location(1) normal: vec4f) -> VSOut {
	var out: VSOut;
	out.pos = u.proj * u.view * u.model * pos;
	out.world_normal = u.model * normal;
	return out;
}

@fragment
fn main_fs(@location(0) world_normal: vec4f) -> @location(0) vec4f {
	// Renormalise the normal
	let normal = normalize(world_normal);

	// Do a very basic normal-based shading
	let sun = normalize(vec4f(1, 1, 1, 0));
	let light = dot(normal, sun) * 0.5 + 0.5;
	return vec4f(vec3f(light), 1.0);
}
