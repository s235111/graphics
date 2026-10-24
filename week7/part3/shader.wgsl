const TAU = 6.283185307179586;

struct Uniforms {
	model: mat4x4f,
	view: mat4x4f,
	proj: mat4x4f,
	tex: mat4x4f,
	eye_pos: vec4f,
	reflective: u32,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var texture: texture_cube<f32>;

struct VSOut {
	@builtin(position) pos: vec4f,
	@location(0) world_pos: vec4f,
	@location(1) world_normal: vec4f,
	@location(2) texcoords: vec3f,
}

@vertex
fn main_vs(@location(0) pos: vec4f, @location(1) normal: vec4f) -> VSOut {
	// Get the model vectors in world space
	let world_pos = u.model * pos;
	let world_normal = u.model * normal;

	// Output the results for the fragment shader
	var out: VSOut;
	out.pos = u.proj * u.view * world_pos;
	out.world_pos = world_pos;
	out.world_normal = world_normal;
	out.texcoords = (u.tex * world_pos).xyz;
	return out;
}

@fragment
fn main_fs(@location(0) world_pos: vec4f, @location(1) world_normal: vec4f, @location(2) texcoords: vec3f) -> @location(0) vec4f {
	if (!bool(u.reflective)) {
		// Sample the cube map and use it directly as the final colour
		return textureSample(texture, samp, texcoords);
	}

	// Renormalise the normal
	let normal = normalize(world_normal);

	// Calculate the reflection of the view vector
	let v = world_pos - u.eye_pos;
	let iw = reflect(v, normal);

	// Sample the cube map and use it directly as the final colour
	return textureSample(texture, samp, iw.xyz);
}
