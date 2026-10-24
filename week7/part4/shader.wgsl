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
@group(0) @binding(1) var cubemapSampler: sampler;
@group(0) @binding(2) var cubemapTexture: texture_cube<f32>;
@group(0) @binding(3) var normalSampler: sampler;
@group(0) @binding(4) var normalTexture: texture_2d<f32>;

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

fn rotate_to_normal(n: vec3f, v: vec3f) -> vec3f {
	let sgn_nz = sign(n.z + 1e-16);
	let p = -1 / (1 + abs(n.z));
	let q = n.x * n.y * p;
	let t = vec3f(1 + n.x * n.x * p, q, -sgn_nz * n.x);
	let b = vec3f(sgn_nz * q, sgn_nz * (1 + n.y * n.y * p), -n.y);
	return mat3x3f(t, b, n) * v;
}

@fragment
fn main_fs(@location(0) world_pos: vec4f, @location(1) world_normal: vec4f, @location(2) texcoords: vec3f) -> @location(0) vec4f {
	if (!bool(u.reflective)) {
		// Sample the cube map and use it directly as the final colour
		return textureSample(cubemapTexture, cubemapSampler, texcoords);
	}

	// Calculate the texture coordinates
	let uv = vec2f(atan2(world_pos.x, world_pos.z) / TAU + 0.5, acos(world_pos.y) * 2 / TAU);

	// Sample the normal map and convert to world space normal
	let surface_normal = textureSample(normalTexture, normalSampler, uv) * 2 - 1;
	let normal = normalize(rotate_to_normal(normalize(world_normal.xyz), normalize(surface_normal.xyz)));

	// Calculate the reflection of the view vector
	let v = world_pos - u.eye_pos;
	let iw = reflect(v.xyz, normal);

	// Sample the cube map and use it directly as the final colour
	return textureSample(cubemapTexture, cubemapSampler, iw);
}
