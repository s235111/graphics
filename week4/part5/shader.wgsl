const TAU = 6.283185307179586;

struct Uniforms {
	model: mat4x4f,
	view: mat4x4f,
	proj: mat4x4f,
	eye_pos: vec4f,
	Le_scale: f32,
	La_scale: f32,
	kd_scale: f32,
	ks_scale: f32,
	s: f32,
}
@group(0) @binding(0) var<uniform> u: Uniforms;

const le = vec4f(0, 0, -1, 0);
const base_Le = vec3f(1, 1, 1);
const base_La = vec3f(1, 1, 1);
const base_kd = vec3f(1, 0, 0);
const base_ks = vec3f(0, 1, 1);

struct VSOut {
	@builtin(position) pos: vec4f,
	@location(0) world_pos: vec4f,
	@location(1) world_normal: vec4f,
}

@vertex
fn main_vs(@location(0) pos: vec4f, @location(1) normal: vec4f, @builtin(instance_index) instance: u32) -> VSOut {
	// Get the model vectors in world space
	let world_pos = u.model * pos;
	let world_normal = u.model * normal;

	// Output the results for the fragment shader
	var out: VSOut;
	out.pos = u.proj * u.view * world_pos;
	out.world_pos = world_pos;
	out.world_normal = world_normal;
	return out;
}

@fragment
fn main_fs(@location(0) world_pos: vec4f, @location(1) world_normal: vec4f) -> @location(0) vec4f {
	// Renormalise the normal
	let normal = normalize(world_normal);

	// Scale everything based on user input
	const V = 1;
	let Li = V * u.Le_scale * base_Le;
	let La = u.La_scale * base_La;
	let kd = u.kd_scale * base_kd;
	let ks = u.ks_scale * base_ks;
	let ka = kd;

	// Calculate the needed vectors
	let ωi = -le;
	let ωr = reflect(ωi, normal);
	let ωo = normalize(world_pos - u.eye_pos);

	// Calculate the lighting values
	let Lrd = kd * Li * max(dot(normal, ωi), 0.0);
	let Lra = ka * La;
	let Lrs = ks * Li * pow(max(dot(ωr, ωo), 0), u.s);
	let Lo = Lrd + Lrs + Lra;

	return vec4f(Lo, 1.0);
}
