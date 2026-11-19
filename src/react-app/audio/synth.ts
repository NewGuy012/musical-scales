type InstrumentVoice = "piano" | "guitar" | "violin" | "cello" | "pad";
export type SoundPreset = InstrumentVoice | "muted";

interface AudioEngine {
	ctx: AudioContext;
	master: GainNode;
	noiseBuffer: AudioBuffer;
}

let sharedEngine: AudioEngine | null = null;
const guitarBufferCache = new Map<string, AudioBuffer>();
const activeVoiceGains = new Set<GainNode>();
const activeVoiceSources = new Set<AudioScheduledSourceNode>();
const MAX_GUITAR_CACHE_SIZE = 72;

function getAudioEngine(): AudioEngine | null {
	if (typeof window === "undefined") return null;
	const AudioCtx =
		window.AudioContext ||
		(window as unknown as { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext;
	if (!AudioCtx) return null;

	if (!sharedEngine) {
		try {
			const ctx = new AudioCtx();
			const compressor = ctx.createDynamicsCompressor();
			compressor.threshold.value = -16;
			compressor.knee.value = 18;
			compressor.ratio.value = 3.5;
			compressor.attack.value = 0.004;
			compressor.release.value = 0.16;

			const master = ctx.createGain();
			master.gain.value = 0.72;

			// Feedforward early reflections for natural room ambience
			const roomTone = createFilter(ctx, "lowpass", 1650, 0.7);
			for (const [delaySec, gainVal] of [
				[0.021, 0.095],
				[0.039, 0.065],
			] as const) {
				const tap = ctx.createDelay(0.1);
				tap.delayTime.value = delaySec;
				const tapGain = ctx.createGain();
				tapGain.gain.value = gainVal;
				chainNodes(master, tap, tapGain, roomTone);
			}

			master.connect(compressor);
			roomTone.connect(compressor);
			compressor.connect(ctx.destination);

			const noiseLen = Math.floor(ctx.sampleRate * 0.35);
			const noiseBuffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
			const noiseData = noiseBuffer.getChannelData(0);
			const rand = createSeededRandom(1337);
			for (let i = 0; i < noiseLen; i++) {
				noiseData[i] = rand();
			}

			sharedEngine = { ctx, master, noiseBuffer };
		} catch {
			return null;
		}
	}

	if (sharedEngine.ctx.state === "suspended") {
		void sharedEngine.ctx.resume().catch(() => {});
	}

	return sharedEngine;
}

function createFilter(
	ctx: AudioContext,
	type: BiquadFilterType,
	frequency: number,
	q = 1,
	gainDb = 0,
): BiquadFilterNode {
	const filter = ctx.createBiquadFilter();
	filter.type = type;
	filter.frequency.value = frequency;
	filter.Q.value = q;
	filter.gain.value = gainDb;
	return filter;
}

function chainNodes(...nodes: AudioNode[]): void {
	for (let i = 0; i < nodes.length - 1; i++) {
		nodes[i].connect(nodes[i + 1]);
	}
}

function registerVoiceCleanup(
	source: AudioScheduledSourceNode,
	noteGain?: GainNode,
): void {
	if (noteGain) activeVoiceGains.add(noteGain);
	activeVoiceSources.add(source);
	source.onended = () => {
		if (noteGain) activeVoiceGains.delete(noteGain);
		activeVoiceSources.delete(source);
		try {
			(noteGain ?? source).disconnect();
		} catch {}
	};
}

export function stopAllAudio(): void {
	if (
		!sharedEngine ||
		(activeVoiceGains.size === 0 && activeVoiceSources.size === 0)
	) {
		return;
	}
	const now = sharedEngine.ctx.currentTime;
	for (const gainNode of activeVoiceGains) {
		try {
			gainNode.gain.cancelScheduledValues(now);
			gainNode.gain.setValueAtTime(Math.max(0.0001, gainNode.gain.value), now);
			gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
		} catch {}
	}
	for (const source of activeVoiceSources) {
		try {
			source.stop(now + 0.035);
		} catch {}
	}
	activeVoiceGains.clear();
	activeVoiceSources.clear();
}

function createSeededRandom(seed: number): () => number {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
	};
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function clampSampleRate(rawRate = 22050): number {
	return Number.isFinite(rawRate)
		? clamp(Math.round(rawRate), 8000, 96000)
		: 22050;
}

function isValidMidi(midi: number): boolean {
	return Number.isFinite(midi) && midi >= 0 && midi <= 127;
}

export function midiToFrequency(midi: number): number {
	const clamped = Number.isFinite(midi) ? clamp(midi, 0, 127) : 69;
	return 440 * Math.pow(2, (clamped - 69) / 12);
}

export function getDefaultChordSpread(
	preset: SoundPreset,
	arpeggiate: boolean,
): number {
	if (arpeggiate) return preset === "piano" || preset === "pad" ? 0.075 : 0.08;
	if (preset === "cello") return 0.058;
	if (preset === "violin") return 0.048;
	if (preset === "guitar") return 0.038;
	return 0.01;
}

function scheduleNoiseBurst(
	engine: AudioEngine,
	startTime: number,
	durationSec: number,
	offsetSeed: number,
	bpFreq: number,
	q: number,
	peakGain: number,
	attackFraction: number,
	dest: AudioNode,
): void {
	const { ctx, noiseBuffer } = engine;
	const src = ctx.createBufferSource();
	src.buffer = noiseBuffer;
	const filter = createFilter(ctx, "bandpass", bpFreq, q);
	const gain = ctx.createGain();
	gain.gain.setValueAtTime(0.0001, startTime);
	gain.gain.linearRampToValueAtTime(
		peakGain,
		startTime + durationSec * attackFraction,
	);
	gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);
	chainNodes(src, filter, gain, dest);
	src.start(startTime, (offsetSeed % 100) * 0.002, durationSec + 0.01);
	src.stop(startTime + durationSec + 0.015);
	registerVoiceCleanup(src);
}

/**
 * Acoustic guitar pluck via Karplus-Strong waveguide synthesis with soundhole
 * displacement, filtered pick texture, and Thiran fractional-delay tuning.
 */
export function synthesizeGuitarPluckSamples(
	freq: number,
	sampleRate: number,
	totalSeconds: number,
): Float32Array {
	const fs = clampSampleRate(sampleRate);
	const safeFreq = Number.isFinite(freq) ? freq : 440;
	const safeSec = Number.isFinite(totalSeconds)
		? clamp(totalSeconds, 0.1, 30)
		: 1.0;
	const clampedFreq = clamp(safeFreq, 40, fs * 0.25);
	const numSamples = Math.max(256, Math.floor(fs * safeSec));
	const out = new Float32Array(numSamples);

	const normPitch = clamp(
		(Math.log2(clampedFreq) - Math.log2(82.41)) / 3,
		0,
		1,
	);
	const blend = 0.36 - normPitch * 0.08;
	const stringDamp = 0.065 + normPitch * 0.115;

	const w = (2 * Math.PI * clampedFreq) / fs;
	const r1 = 1 - blend + blend * Math.cos(w);
	const i1 = -blend * Math.sin(w);
	const pd1 = w > 0 ? -Math.atan2(i1, r1) / w : blend;
	const mag1 = Math.hypot(r1, i1);

	const r2 = 1 - stringDamp * Math.cos(w);
	const i2 = stringDamp * Math.sin(w);
	const pd2 = w > 0 ? Math.atan2(i2, r2) / w : stringDamp / (1 - stringDamp);
	const mag2 = (1 - stringDamp) / Math.hypot(r2, i2);

	const exactPeriod = fs / clampedFreq - (pd1 + pd2);
	const M = Math.max(2, Math.floor(exactPeriod - 0.5));
	const tau = Math.max(0.25, Math.min(1.75, exactPeriod - M));
	const allpassCoeff = (1 - tau) / (1 + tau);

	const decaySec = 3.8 - normPitch * 1.35;
	const targetLoopGain = Math.pow(0.001, 1 / (clampedFreq * decaySec));
	const loopFeedback = Math.min(
		0.9988,
		targetLoopGain / Math.max(0.45, mag1 * mag2),
	);

	// 1. Warm filtered finger/pick noise component
	const rawBurst = new Float32Array(M);
	const rand = createSeededRandom(Math.round(clampedFreq * 100));
	const pickPole = Math.exp((-2 * Math.PI * 1650) / fs);
	let lpState = 0;
	for (let i = 0; i < M * 2; i++) {
		lpState = (1 - pickPole) * rand() + pickPole * lpState;
		rawBurst[i % M] = lpState;
	}
	for (let i = M - 1; i >= 0; i--) {
		lpState = (1 - pickPole) * rawBurst[i] + pickPole * lpState;
		rawBurst[i] = lpState;
	}

	let noiseMean = 0;
	for (let i = 0; i < M; i++) noiseMean += rawBurst[i];
	noiseMean /= M;

	const noiseShape = new Float32Array(M);
	const pluckOffset = Math.max(1, Math.min(M - 1, Math.round(M * 0.19)));
	let noisePeak = 0;
	for (let i = 0; i < M; i++) {
		const a = rawBurst[i] - noiseMean;
		const b = rawBurst[(i - pluckOffset + M) % M] - noiseMean;
		const val = 0.65 * (a - 0.52 * b) + 0.35 * a;
		noiseShape[i] = val;
		const absVal = Math.abs(val);
		if (absVal > noisePeak) noisePeak = absVal;
	}

	// 2. Triangular soundhole pluck displacement (strong fundamental & warm 2nd/3rd harmonics)
	const triShape = new Float32Array(M);
	let triMean = 0;
	for (let i = 0; i < M; i++) {
		const v =
			i <= pluckOffset
				? i / pluckOffset
				: (M - i) / Math.max(1, M - pluckOffset);
		triShape[i] = v;
		triMean += v;
	}
	triMean /= M;
	let triPeak = 0;
	for (let i = 0; i < M; i++) {
		triShape[i] -= triMean;
		const absVal = Math.abs(triShape[i]);
		if (absVal > triPeak) triPeak = absVal;
	}

	const triWeight = 0.68 - normPitch * 0.12;
	const noiseWeight = 1 - triWeight;
	const ring = new Float32Array(M);
	let peak = 0;
	for (let i = 0; i < M; i++) {
		const tNorm = triPeak > 1e-6 ? triShape[i] / triPeak : 0;
		const nNorm = noisePeak > 1e-6 ? noiseShape[i] / noisePeak : 0;
		const combined = triWeight * tNorm + noiseWeight * nNorm;
		ring[i] = combined;
		const absVal = Math.abs(combined);
		if (absVal > peak) peak = absVal;
	}
	const normScale = peak > 1e-6 ? 0.9 / peak : 1;
	for (let i = 0; i < M; i++) {
		ring[i] *= normScale;
	}

	let ptr = 0;
	let prevCur = ring[M - 1];
	let iirLp = 0;
	let prevLp = 0;
	let prevAp = 0;

	const fadeInSamples = Math.min(numSamples, Math.round(fs * 0.0025));
	const fadeOutSamples = Math.min(numSamples, Math.round(fs * 0.085));
	const fadeOutStart = numSamples - fadeOutSamples;

	for (let i = 0; i < numSamples; i++) {
		const cur = ring[ptr];
		const fir = (1 - blend) * cur + blend * prevCur;
		prevCur = cur;

		iirLp = (1 - stringDamp) * fir + stringDamp * iirLp;

		const ap = allpassCoeff * iirLp + prevLp - allpassCoeff * prevAp;
		prevLp = iirLp;
		prevAp = ap;

		ring[ptr] = ap * loopFeedback;
		ptr = ptr + 1 >= M ? 0 : ptr + 1;

		let env = 1;
		if (i < fadeInSamples) {
			env = i / fadeInSamples;
		} else if (i >= fadeOutStart) {
			env = (numSamples - i) / fadeOutSamples;
		}
		out[i] = clamp(ap * env, -1, 1);
	}

	return out;
}

function getGuitarPluckBuffer(
	ctx: AudioContext,
	freq: number,
	totalSeconds: number,
): AudioBuffer {
	const quantizedDur = Math.ceil(totalSeconds * 4) / 4;
	const key = `${ctx.sampleRate}:${Math.round(freq * 10)}:${quantizedDur}`;
	const cached = guitarBufferCache.get(key);
	if (cached) return cached;

	const samples = synthesizeGuitarPluckSamples(
		freq,
		ctx.sampleRate,
		quantizedDur,
	);
	const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
	buffer.getChannelData(0).set(samples);

	if (guitarBufferCache.size >= MAX_GUITAR_CACHE_SIZE) {
		const oldestKey = guitarBufferCache.keys().next().value;
		if (oldestKey) guitarBufferCache.delete(oldestKey);
	}
	guitarBufferCache.set(key, buffer);
	return buffer;
}

function clampVelocity(velocity?: number): number {
	if (velocity === undefined || !Number.isFinite(velocity)) return 0.8;
	return clamp(velocity, 0.05, 1);
}

function scaleGainByVelocity(baseGain: number, velocity?: number): number {
	if (velocity === undefined) return baseGain;
	const v = clampVelocity(velocity);
	return baseGain * (0.25 + 0.94 * v);
}

interface VoiceDetail {
	velocity?: number;
	technique?: string;
	slideFromMidi?: number;
}

function schedulePianoVoice(
	engine: AudioEngine,
	midi: number,
	startTime: number,
	duration: number,
	peakGain: number,
	detail?: VoiceDetail,
) {
	const { ctx, master } = engine;
	const freq = midiToFrequency(midi);
	const pitchNorm = Math.max(0, Math.min(1, (midi - 21) / 87));
	const vel = clampVelocity(detail?.velocity);
	const scaledGain = scaleGainByVelocity(peakGain, detail?.velocity);
	const brightScale = 0.72 + 0.45 * vel;

	const stringFilter = createFilter(
		ctx,
		"lowpass",
		Math.min(6400, Math.max(950, freq * (9.5 - pitchNorm * 4) * brightScale)),
		0.7,
	);
	stringFilter.frequency.exponentialRampToValueAtTime(
		Math.min(3400, Math.max(550, freq * 4.6 * brightScale)),
		startTime + 0.075,
	);
	stringFilter.frequency.exponentialRampToValueAtTime(
		Math.max(320, freq * 2.0),
		startTime + Math.min(0.75, duration + 0.18),
	);

	const boardResonance = createFilter(ctx, "peaking", 230, 1.1, 2.4);
	const baseRelease = 0.65 - pitchNorm * 0.24;
	const release =
		detail?.technique === "staccato"
			? Math.min(0.18, baseRelease)
			: baseRelease;
	const stopTime = startTime + duration + release;

	const noteGain = ctx.createGain();
	noteGain.gain.setValueAtTime(0.0001, startTime);
	noteGain.gain.linearRampToValueAtTime(scaledGain * 1.12, startTime + 0.005);
	noteGain.gain.exponentialRampToValueAtTime(
		scaledGain * 0.68,
		startTime + 0.08,
	);
	noteGain.gain.exponentialRampToValueAtTime(
		scaledGain * 0.36,
		startTime + Math.max(0.14, duration * 0.72),
	);
	noteGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

	const partials: [OscillatorType, number, number, number][] = [
		["triangle", freq, -1.8, 0.78],
		["sawtooth", freq, 1.8, 0.36 - pitchNorm * 0.12],
		["sine", freq * 2.0012, 0, 0.2],
	];

	partials.forEach(([type, oscFreq, detune, gain], idx) => {
		const osc = ctx.createOscillator();
		const g = ctx.createGain();
		osc.type = type;
		osc.frequency.setValueAtTime(oscFreq, startTime);
		if (detune !== 0) osc.detune.setValueAtTime(detune, startTime);
		g.gain.setValueAtTime(gain, startTime);
		if (idx === 2) {
			g.gain.exponentialRampToValueAtTime(0.015, startTime + 0.42);
		}
		chainNodes(osc, g, stringFilter);
		osc.start(startTime);
		osc.stop(stopTime + 0.03);
		registerVoiceCleanup(osc, idx === 0 ? noteGain : undefined);
	});

	chainNodes(stringFilter, boardResonance, noteGain, master);
	scheduleNoiseBurst(
		engine,
		startTime,
		0.025,
		midi * 17,
		Math.min(2400, Math.max(420, freq * 4.2)),
		1.6,
		scaledGain * 0.12,
		0.12,
		boardResonance,
	);
}

function scheduleGuitarVoice(
	engine: AudioEngine,
	midi: number,
	startTime: number,
	duration: number,
	peakGain: number,
	detail?: VoiceDetail,
) {
	const { ctx, master } = engine;
	const freq = midiToFrequency(midi);
	const tech = detail?.technique ?? "normal";
	const vel = clampVelocity(detail?.velocity);
	const scaledGain = scaleGainByVelocity(peakGain, detail?.velocity);

	const isMuted = tech === "palmMute";
	const isStaccato = tech === "staccato";
	const isHarmonic = tech === "harmonic";
	const isLegatoPluck = tech === "hammer" || tech === "pull" || tech === "slur";

	const effectiveDuration = isMuted
		? Math.min(duration, 0.16)
		: isStaccato
			? Math.min(duration, 0.18)
			: duration;
	const release = isMuted
		? 0.09
		: isStaccato
			? 0.12
			: isHarmonic
				? Math.min(1.15, Math.max(0.45, effectiveDuration * 0.85))
				: tech === "letRing"
					? Math.min(1.15, Math.max(0.45, effectiveDuration * 0.65))
					: isLegatoPluck
						? Math.min(0.48, Math.max(0.14, effectiveDuration * 0.5))
						: Math.min(0.52, Math.max(0.16, effectiveDuration * 0.45));
	const stopTime = startTime + effectiveDuration + release;

	const src = ctx.createBufferSource();
	src.buffer = getGuitarPluckBuffer(
		ctx,
		freq,
		Math.max(effectiveDuration + release, 2.2),
	);

	if (
		(tech === "slide" || tech === "portamento") &&
		detail?.slideFromMidi !== undefined &&
		isValidMidi(detail.slideFromMidi) &&
		detail.slideFromMidi !== midi
	) {
		const startRatio = Math.max(
			0.5,
			Math.min(2.0, Math.pow(2, (detail.slideFromMidi - midi) / 12)),
		);
		src.playbackRate.setValueAtTime(startRatio, startTime);
		src.playbackRate.exponentialRampToValueAtTime(
			1.0,
			startTime + Math.min(0.075, Math.max(0.025, effectiveDuration * 0.45)),
		);
	}

	// Acoustic dreadnought/concert body voicing: broad air + spruce warmth, gentle mid clarity
	const bodyHPF = createFilter(ctx, "highpass", 68, 0.7);
	const airWarmth = createFilter(
		ctx,
		"peaking",
		108,
		1.05,
		isMuted ? 3.2 : 2.4,
	);
	const topWood = createFilter(ctx, "peaking", 235, 0.95, 2.1);
	const boxCleanup = createFilter(ctx, "peaking", 450, 0.85, -2.4);
	const woodPresence = createFilter(
		ctx,
		"peaking",
		1420,
		0.75,
		isMuted ? -1.5 : 1.2,
	);

	const initialLPF = isMuted
		? Math.min(1450, Math.max(680, freq * 3.8))
		: isHarmonic
			? Math.min(4800, Math.max(2400, freq * 9.5))
			: Math.min(4100, Math.max(2000, freq * (7.2 + vel * 2.2)));
	const settleLPF = isMuted
		? Math.min(720, Math.max(360, freq * 2.2))
		: isHarmonic
			? Math.min(2800, Math.max(1300, freq * 5.0))
			: Math.min(1950, Math.max(900, freq * 3.8));
	const bodyLPF = createFilter(ctx, "lowpass", initialLPF, 0.6);
	bodyLPF.frequency.exponentialRampToValueAtTime(
		settleLPF,
		startTime + Math.min(0.42, Math.max(0.06, effectiveDuration * 0.65)),
	);

	const noteGain = ctx.createGain();
	const ksGain = scaledGain * (isHarmonic ? 1.22 : isMuted ? 1.15 : 1.42);
	const attackSec = isHarmonic ? 0.008 : isLegatoPluck ? 0.006 : 0.0035;
	noteGain.gain.setValueAtTime(0.0001, startTime);
	noteGain.gain.linearRampToValueAtTime(ksGain, startTime + attackSec);
	noteGain.gain.exponentialRampToValueAtTime(
		ksGain * (isMuted ? 0.42 : 0.72),
		startTime + Math.min(0.28, Math.max(0.035, effectiveDuration * 0.45)),
	);
	noteGain.gain.exponentialRampToValueAtTime(
		ksGain * (isMuted ? 0.14 : 0.42),
		startTime + Math.max(0.06, effectiveDuration),
	);
	noteGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

	chainNodes(
		src,
		bodyHPF,
		airWarmth,
		topWood,
		boxCleanup,
		woodPresence,
		bodyLPF,
		noteGain,
		master,
	);
	registerVoiceCleanup(src, noteGain);

	src.start(startTime);
	src.stop(stopTime + 0.03);

	// Subtle woody finger/pick contact transient (omitted on harmonics and hammer/pull-offs)
	if (!isHarmonic && !isLegatoPluck) {
		scheduleNoiseBurst(
			engine,
			startTime,
			0.015,
			midi * 19,
			Math.min(1150, Math.max(480, freq * 3.4)),
			1.4,
			scaledGain * (isMuted ? 0.075 : 0.055),
			0.133,
			topWood,
		);
	}
}

interface BowedVoiceProfile {
	attackSustained: number;
	attackShortFloor: number;
	attackShortRatio: number;
	releaseShort: number;
	releaseSustained: number;
	bowPeakCap: number;
	bowPeakMin: number;
	bowPeakMult: number;
	bowSusCap: number;
	bowSusMin: number;
	bowSusMult: number;
	vibratoHz: number;
	vibratoDelayMax: number;
	vibratoDepthShort: number;
	vibratoDepthSustained: number;
	gainScale: number;
	sawGain: number;
	triGain: number;
	bowBandpassMin: number;
	bowBandpassMax: number;
	formants: readonly [freq: number, q: number, gainDb: number][];
}

const BOWED_VOICE_PROFILES: Record<"cello" | "violin", BowedVoiceProfile> = {
	cello: {
		attackSustained: 0.078,
		attackShortFloor: 0.025,
		attackShortRatio: 0.14,
		releaseShort: 0.26,
		releaseSustained: 0.44,
		bowPeakCap: 2500,
		bowPeakMin: 720,
		bowPeakMult: 7.2,
		bowSusCap: 1850,
		bowSusMin: 520,
		bowSusMult: 4.5,
		vibratoHz: 5.2,
		vibratoDelayMax: 0.13,
		vibratoDepthShort: 3.5,
		vibratoDepthSustained: 11.5,
		gainScale: 1.0,
		sawGain: 0.7,
		triGain: 0.36,
		bowBandpassMin: 520,
		bowBandpassMax: 1300,
		// Cello body formants: A0 f-hole air, B1 chest wood, box scoop, singing bridge hill
		formants: [
			[78, 1.8, 4.0],
			[195, 2.1, 4.2],
			[490, 1.4, -3.2],
			[1150, 1.5, 3.0],
		],
	},
	violin: {
		attackSustained: 0.068,
		attackShortFloor: 0.022,
		attackShortRatio: 0.13,
		releaseShort: 0.24,
		releaseSustained: 0.38,
		bowPeakCap: 4600,
		bowPeakMin: 1350,
		bowPeakMult: 6.2,
		bowSusCap: 3400,
		bowSusMin: 950,
		bowSusMult: 4.2,
		vibratoHz: 5.8,
		vibratoDelayMax: 0.14,
		vibratoDepthShort: 4.0,
		vibratoDepthSustained: 13.5,
		gainScale: 0.92,
		sawGain: 0.64,
		triGain: 0.4,
		bowBandpassMin: 900,
		bowBandpassMax: 2400,
		// Violin body formants: A0 air (278 Hz), B1 wood (490 Hz), nasal scoop, singing bridge hill
		formants: [
			[278, 2.0, 3.5],
			[490, 2.0, 3.8],
			[980, 1.4, -3.5],
			[2450, 1.4, 3.2],
		],
	},
};

function scheduleBowedVoice(
	engine: AudioEngine,
	midi: number,
	startTime: number,
	duration: number,
	peakGain: number,
	profile: BowedVoiceProfile,
	detail?: VoiceDetail,
) {
	const { ctx, master } = engine;
	const freq = midiToFrequency(midi);
	const tech = detail?.technique ?? "normal";
	const vel = clampVelocity(detail?.velocity);
	const scaledBaseGain = scaleGainByVelocity(peakGain, detail?.velocity);
	const isPizz = tech === "pizzicato";
	const isStaccato = tech === "staccato";
	const isHarmonic = tech === "harmonic";
	const isSlurred = tech === "slur";

	const isShort = duration <= 0.42 || isPizz || isStaccato;
	const attack = isPizz
		? 0.006
		: isSlurred
			? Math.min(0.016, Math.max(0.008, duration * 0.08))
			: isShort
				? Math.max(
						profile.attackShortFloor,
						duration * profile.attackShortRatio,
					)
				: profile.attackSustained;
	const release = isPizz
		? 0.14
		: isStaccato
			? 0.12
			: isShort
				? profile.releaseShort
				: profile.releaseSustained;
	const stopTime = startTime + duration + release;

	const brightScale = 0.72 + 0.45 * vel;
	const bowLPF = createFilter(ctx, "lowpass", Math.max(360, freq * 2.4), 0.75);
	bowLPF.frequency.exponentialRampToValueAtTime(
		Math.min(
			profile.bowPeakCap,
			Math.max(profile.bowPeakMin, freq * profile.bowPeakMult * brightScale),
		),
		startTime + attack + 0.04,
	);
	bowLPF.frequency.exponentialRampToValueAtTime(
		Math.min(
			profile.bowSusCap,
			Math.max(profile.bowSusMin, freq * profile.bowSusMult),
		),
		startTime + Math.max(attack + 0.12, duration),
	);

	const vibratoLfo = ctx.createOscillator();
	vibratoLfo.type = "sine";
	vibratoLfo.frequency.setValueAtTime(profile.vibratoHz, startTime);
	const vibratoDepth = ctx.createGain();
	vibratoDepth.gain.setValueAtTime(0, startTime);
	vibratoDepth.gain.setValueAtTime(
		0,
		startTime + Math.min(profile.vibratoDelayMax, duration * 0.35),
	);
	vibratoDepth.gain.linearRampToValueAtTime(
		isPizz || isHarmonic
			? 0
			: isShort
				? profile.vibratoDepthShort
				: profile.vibratoDepthSustained,
		startTime + Math.min(0.42, Math.max(0.2, duration * 0.72)),
	);
	vibratoLfo.connect(vibratoDepth);

	const scaledPeak = scaledBaseGain * profile.gainScale;
	const noteGain = ctx.createGain();
	noteGain.gain.setValueAtTime(0.0001, startTime);
	if (isPizz) {
		noteGain.gain.linearRampToValueAtTime(
			scaledPeak * 1.05,
			startTime + attack,
		);
		noteGain.gain.exponentialRampToValueAtTime(
			scaledPeak * 0.25,
			startTime + Math.max(0.06, duration * 0.65),
		);
	} else {
		noteGain.gain.linearRampToValueAtTime(
			scaledPeak * 0.88,
			startTime + attack,
		);
		noteGain.gain.linearRampToValueAtTime(
			scaledPeak * 0.94,
			startTime + Math.max(attack + 0.04, duration * 0.82),
		);
	}
	noteGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

	const oscSpecs: readonly [OscillatorType, number][] = isHarmonic
		? [
				["triangle", profile.triGain * 1.35],
				["sine", profile.sawGain * 0.6],
			]
		: [
				["sawtooth", profile.sawGain],
				["triangle", profile.triGain],
			];
	const glideStartFreq =
		(tech === "portamento" || tech === "slide") &&
		detail?.slideFromMidi !== undefined &&
		isValidMidi(detail.slideFromMidi) &&
		detail.slideFromMidi !== midi
			? midiToFrequency(detail.slideFromMidi)
			: null;

	oscSpecs.forEach(([type, gainVal], idx) => {
		const osc = ctx.createOscillator();
		const g = ctx.createGain();
		osc.type = type;
		if (glideStartFreq !== null) {
			osc.frequency.setValueAtTime(glideStartFreq, startTime);
			osc.frequency.exponentialRampToValueAtTime(
				freq,
				startTime + Math.min(0.08, Math.max(0.03, duration * 0.45)),
			);
		} else {
			osc.frequency.setValueAtTime(freq, startTime);
		}
		g.gain.setValueAtTime(gainVal, startTime);
		vibratoDepth.connect(osc.detune);
		chainNodes(osc, g, bowLPF);
		osc.start(startTime);
		osc.stop(stopTime + 0.04);
		registerVoiceCleanup(osc, idx === 0 ? noteGain : undefined);
	});

	const formantFilters = profile.formants.map(([fFreq, q, gainDb]) =>
		createFilter(ctx, "peaking", fFreq, q, gainDb),
	);
	chainNodes(bowLPF, ...formantFilters, noteGain, master);

	vibratoLfo.start(startTime);
	vibratoLfo.stop(stopTime + 0.04);
	registerVoiceCleanup(vibratoLfo);

	if (!isHarmonic && !isPizz) {
		const noiseDur = isShort ? 0.04 : 0.075;
		scheduleNoiseBurst(
			engine,
			startTime,
			noiseDur,
			midi * 23,
			Math.min(
				profile.bowBandpassMax,
				Math.max(profile.bowBandpassMin, freq * 5),
			),
			2.2,
			scaledPeak * (isSlurred ? 0.018 : 0.055),
			0.35,
			bowLPF,
		);
	}
}

function schedulePadVoice(
	engine: AudioEngine,
	midi: number,
	startTime: number,
	duration: number,
	peakGain: number,
	detail?: VoiceDetail,
) {
	const { ctx, master } = engine;
	const freq = midiToFrequency(midi);
	const scaledGain = scaleGainByVelocity(peakGain, detail?.velocity);
	const filter = createFilter(
		ctx,
		"lowpass",
		Math.min(1800, Math.max(520, freq * 3.5)),
		0.5,
	);
	const noteGain = ctx.createGain();
	const stopTime = startTime + duration + 0.85;

	noteGain.gain.setValueAtTime(0.0001, startTime);
	noteGain.gain.linearRampToValueAtTime(scaledGain * 0.8, startTime + 0.08);
	noteGain.gain.setValueAtTime(scaledGain * 0.72, startTime + duration);
	noteGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

	(
		[
			["triangle", -6],
			["sine", 6],
		] as const
	).forEach(([type, detune], idx) => {
		const osc = ctx.createOscillator();
		osc.type = type;
		osc.frequency.setValueAtTime(freq, startTime);
		osc.detune.setValueAtTime(detune, startTime);
		osc.connect(filter);
		osc.start(startTime);
		osc.stop(stopTime + 0.05);
		registerVoiceCleanup(osc, idx === 0 ? noteGain : undefined);
	});

	chainNodes(filter, noteGain, master);
}

function scheduleVoice(
	engine: AudioEngine,
	midi: number,
	startTime: number,
	duration: number,
	peakGain: number,
	preset: InstrumentVoice,
	detail?: VoiceDetail,
) {
	switch (preset) {
		case "piano":
			schedulePianoVoice(engine, midi, startTime, duration, peakGain, detail);
			break;
		case "guitar":
			scheduleGuitarVoice(engine, midi, startTime, duration, peakGain, detail);
			break;
		case "violin":
			scheduleBowedVoice(
				engine,
				midi,
				startTime,
				duration,
				peakGain,
				BOWED_VOICE_PROFILES.violin,
				detail,
			);
			break;
		case "cello":
			scheduleBowedVoice(
				engine,
				midi,
				startTime,
				duration,
				peakGain,
				BOWED_VOICE_PROFILES.cello,
				detail,
			);
			break;
		case "pad":
			schedulePadVoice(engine, midi, startTime, duration, peakGain, detail);
			break;
	}
}

const LOOKAHEAD_SEC = 0.13;
const SCHEDULER_INTERVAL_MS = 25;
const AUDIO_LEAD_SEC = 0.015;
const MAX_OFFLINE_RENDER_SEC = 600;

function resolveValidStepNotes(
	midiNotes: readonly number[],
	durationSec: number,
	stepNotes?: readonly TimedNoteDetail[],
	stepVelocity?: number,
): TimedNoteDetail[] {
	const raw: TimedNoteDetail[] =
		stepNotes && stepNotes.length > 0
			? [...stepNotes]
			: midiNotes.map((midi) => ({
					midi,
					durationSec,
					velocity: stepVelocity,
				}));
	return raw.filter((n) => isValidMidi(n.midi));
}

function scheduleChordAtCtxTime(
	engine: AudioEngine,
	midiNotes: number[],
	atCtxTime: number,
	durationSec: number,
	preset: InstrumentVoice,
	arpeggiate: boolean,
	spreadSec?: number,
	stepNotes?: TimedNoteDetail[],
	stepVelocity?: number,
): void {
	const resolvedNotes = resolveValidStepNotes(
		midiNotes,
		durationSec,
		stepNotes,
		stepVelocity,
	);
	if (resolvedNotes.length === 0) return;

	const single = resolvedNotes.length === 1;
	const perNoteGain = single
		? 0.24
		: Math.min(0.22, 0.54 / resolvedNotes.length);
	const spread = single
		? 0
		: (spreadSec ?? getDefaultChordSpread(preset, arpeggiate));

	resolvedNotes.forEach((detail, idx) => {
		scheduleVoice(
			engine,
			detail.midi,
			atCtxTime + idx * spread,
			detail.durationSec,
			perNoteGain,
			preset,
			{
				velocity: detail.velocity ?? stepVelocity,
				technique: detail.technique,
				slideFromMidi: detail.slideFromMidi,
			},
		);
	});
}

export function playSingleNote(
	midi: number,
	preset: SoundPreset = "piano",
	duration = 0.55,
): void {
	if (preset === "muted" || !isValidMidi(midi)) return;
	const engine = getAudioEngine();
	if (!engine) return;
	scheduleVoice(
		engine,
		midi,
		engine.ctx.currentTime + 0.01,
		duration,
		0.24,
		preset,
	);
}

export function playChordNotes(
	midiNotes: number[],
	options: {
		preset?: SoundPreset;
		duration?: number;
		arpeggiate?: boolean;
		spreadSec?: number;
	} = {},
): void {
	const {
		preset = "piano",
		duration = 0.95,
		arpeggiate = false,
		spreadSec,
	} = options;
	if (preset === "muted") return;
	const engine = getAudioEngine();
	if (!engine) return;
	scheduleChordAtCtxTime(
		engine,
		midiNotes,
		engine.ctx.currentTime + AUDIO_LEAD_SEC,
		duration,
		preset,
		arpeggiate,
		spreadSec,
	);
}

interface TimedNoteDetail extends VoiceDetail {
	midi: number;
	durationSec: number;
}

interface TimedSequenceStep {
	midi: number[];
	atMs: number;
	durationSec: number;
	spreadSec?: number;
	velocity?: number;
	notes?: TimedNoteDetail[];
}

export function playStepSequence(
	steps: { midi: number[]; durationSec?: number }[],
	options: {
		preset?: SoundPreset;
		stepMs: number;
		arpeggiate?: boolean;
		spreadSec?: number;
		onStep?: (index: number) => void;
		onDone?: () => void;
	},
): () => void {
	const {
		preset = "piano",
		stepMs,
		arpeggiate = false,
		spreadSec,
		onStep,
		onDone,
	} = options;
	const timedSteps: TimedSequenceStep[] = steps.map((step, idx) => ({
		midi: step.midi,
		atMs: idx * stepMs,
		durationSec:
			step.durationSec ??
			(step.midi.length === 1
				? Math.max(0.28, (stepMs / 1000) * 0.9)
				: Math.max(0.45, (stepMs / 1000) * 0.88)),
		spreadSec,
	}));
	return playTimedSequence(timedSteps, {
		preset,
		arpeggiate,
		totalDurationMs: steps.length * stepMs,
		onStep,
		onDone,
	});
}

export function playTimedSequence(
	steps: TimedSequenceStep[],
	options: {
		preset?: SoundPreset;
		arpeggiate?: boolean;
		totalDurationMs?: number;
		startOffsetMs?: number;
		onStep?: (index: number) => void;
		onProgress?: (elapsedMs: number) => void;
		onDone?: () => void;
	},
): () => void {
	const {
		preset = "piano",
		arpeggiate = false,
		totalDurationMs,
		startOffsetMs: rawStartOffsetMs = 0,
		onStep,
		onProgress,
		onDone,
	} = options;
	const computedEndMs =
		totalDurationMs ??
		steps.reduce(
			(maxMs, s) => Math.max(maxMs, s.atMs + s.durationSec * 1000),
			0,
		);
	const startOffsetMs = Math.max(0, Math.min(rawStartOffsetMs, computedEndMs));

	let cancelled = false;
	let finished = false;
	let rafId: number | null = null;
	let schedulerTimerId: ReturnType<typeof globalThis.setInterval> | null = null;
	let initialTimerId: ReturnType<typeof globalThis.setTimeout> | null = null;

	const cleanupTimers = () => {
		if (initialTimerId !== null) {
			globalThis.clearTimeout(initialTimerId);
			initialTimerId = null;
		}
		if (schedulerTimerId !== null) {
			globalThis.clearInterval(schedulerTimerId);
			schedulerTimerId = null;
		}
		if (
			rafId !== null &&
			typeof globalThis.cancelAnimationFrame === "function"
		) {
			globalThis.cancelAnimationFrame(rafId);
			rafId = null;
		}
	};

	const cancel = () => {
		cancelled = true;
		cleanupTimers();
		stopAllAudio();
	};

	if (steps.length === 0 || startOffsetMs >= computedEndMs) {
		initialTimerId = globalThis.setTimeout(() => {
			if (cancelled || finished) return;
			finished = true;
			onProgress?.(computedEndMs);
			onDone?.();
		}, 0);
		return cancel;
	}

	const engine = preset === "muted" ? null : getAudioEngine();
	const nowPerf = () =>
		typeof performance !== "undefined" ? performance.now() : Date.now();
	const wallStartMs = nowPerf();
	const initialCtxTime = engine ? engine.ctx.currentTime : 0;
	const scheduledZeroCtxSec = engine
		? initialCtxTime + AUDIO_LEAD_SEC - startOffsetMs / 1000
		: 0;
	let audioClockVerified = false;

	let nextVisualIdx = steps.findIndex((s) => s.atMs >= startOffsetMs - 0.5);
	if (nextVisualIdx < 0) nextVisualIdx = steps.length;
	const enclosingIdx =
		nextVisualIdx > 0 && steps[nextVisualIdx - 1].atMs < startOffsetMs
			? nextVisualIdx - 1
			: -1;
	let emittedEnclosing = false;

	let nextAudioIdx = nextVisualIdx;
	let lastReportedMs = -1;

	const getElapsedSongMs = (): number => {
		const wallElapsed = nowPerf() - wallStartMs;
		if (engine && preset !== "muted") {
			const ctxTime = engine.ctx.currentTime;
			if (!audioClockVerified && ctxTime > initialCtxTime + 0.001) {
				audioClockVerified = true;
			}
			if (audioClockVerified) {
				const audioElapsedMs = Math.max(
					0,
					(ctxTime - scheduledZeroCtxSec) * 1000 - startOffsetMs,
				);
				return Math.min(computedEndMs, startOffsetMs + audioElapsedMs);
			}
			if (wallElapsed < AUDIO_LEAD_SEC * 1000) {
				return startOffsetMs;
			}
		}
		return Math.min(computedEndMs, startOffsetMs + wallElapsed);
	};

	const scheduleAudioLookahead = () => {
		if (!engine || preset === "muted" || cancelled || finished) return;
		const nowCtx = engine.ctx.currentTime;
		while (nextAudioIdx < steps.length) {
			const step = steps[nextAudioIdx];
			const targetCtxTime = scheduledZeroCtxSec + step.atMs / 1000;
			if (targetCtxTime > nowCtx + LOOKAHEAD_SEC) break;
			scheduleChordAtCtxTime(
				engine,
				step.midi,
				Math.max(nowCtx + 0.004, targetCtxTime),
				step.durationSec,
				preset,
				arpeggiate,
				step.spreadSec,
				step.notes,
				step.velocity,
			);
			nextAudioIdx++;
		}
	};

	const completeSequence = () => {
		if (cancelled || finished) return;
		while (nextVisualIdx < steps.length) {
			onStep?.(nextVisualIdx);
			nextVisualIdx++;
		}
		finished = true;
		cleanupTimers();
		onProgress?.(computedEndMs);
		onDone?.();
	};

	const syncVisuals = () => {
		if (cancelled || finished) return;
		if (!emittedEnclosing && enclosingIdx >= 0) {
			emittedEnclosing = true;
			onStep?.(enclosingIdx);
		}
		const elapsedMs = getElapsedSongMs();
		while (
			nextVisualIdx < steps.length &&
			steps[nextVisualIdx].atMs <= elapsedMs + 2
		) {
			onStep?.(nextVisualIdx);
			nextVisualIdx++;
		}
		if (Math.abs(elapsedMs - lastReportedMs) >= 1) {
			lastReportedMs = elapsedMs;
			onProgress?.(elapsedMs);
		}
		if (elapsedMs >= computedEndMs) {
			completeSequence();
		}
	};

	const tick = () => {
		scheduleAudioLookahead();
		syncVisuals();
	};

	const runRaf = () => {
		if (cancelled || finished) return;
		tick();
		if (
			!cancelled &&
			!finished &&
			typeof globalThis.requestAnimationFrame === "function"
		) {
			rafId = globalThis.requestAnimationFrame(runRaf);
		}
	};

	initialTimerId = globalThis.setTimeout(() => {
		if (cancelled || finished) return;
		tick();
		if (cancelled || finished) return;
		schedulerTimerId = globalThis.setInterval(tick, SCHEDULER_INTERVAL_MS);
		if (typeof globalThis.requestAnimationFrame === "function") {
			rafId = globalThis.requestAnimationFrame(runRaf);
		}
	}, 0);

	return cancel;
}

/** Offline PCM renderer mirroring live presets for WAV export/verification. */
export function renderTimedSequenceOfflineSamples(
	steps: TimedSequenceStep[],
	options: {
		preset?: InstrumentVoice;
		sampleRate?: number;
		totalDurationMs?: number;
	} = {},
): Float32Array {
	const {
		preset = "guitar",
		sampleRate: rawRate = 22050,
		totalDurationMs,
	} = options;
	const sampleRate = clampSampleRate(rawRate);
	const endMs =
		totalDurationMs ??
		steps.reduce(
			(maxMs, s) => Math.max(maxMs, s.atMs + s.durationSec * 1000),
			0,
		);
	const totalSec = clamp(
		(Number.isFinite(endMs) ? endMs : 0) / 1000 + 0.6,
		0.1,
		MAX_OFFLINE_RENDER_SEC,
	);
	const out = new Float32Array(Math.ceil(totalSec * sampleRate));
	const pluckCache = new Map<string, Float32Array>();

	for (const step of steps) {
		const validNotes = resolveValidStepNotes(
			step.midi,
			step.durationSec,
			step.notes,
			step.velocity,
		);
		if (validNotes.length === 0) continue;

		const baseGain =
			validNotes.length === 1 ? 0.28 : Math.min(0.24, 0.56 / validNotes.length);
		const spread =
			step.spreadSec ??
			(validNotes.length === 1 ? 0 : getDefaultChordSpread(preset, false));

		validNotes.forEach((detail, idx) => {
			const startSec = step.atMs / 1000 + idx * spread;
			const startSample = Math.max(0, Math.floor(startSec * sampleRate));
			const tech = detail.technique ?? "normal";
			const isMuted = tech === "palmMute" || tech === "staccato";
			const noteDur = isMuted
				? Math.min(detail.durationSec, 0.16)
				: detail.durationSec;
			const releaseSec =
				preset === "guitar"
					? isMuted
						? 0.09
						: tech === "harmonic" || tech === "letRing"
							? Math.min(1.0, Math.max(0.4, noteDur * 0.7))
							: Math.min(0.45, Math.max(0.14, noteDur * 0.4))
					: 0.22;
			const renderDur = Math.max(0.08, noteDur + releaseSec);
			const numSamples = Math.min(
				out.length - startSample,
				Math.floor(renderDur * sampleRate),
			);
			if (numSamples <= 0) return;

			const amp = scaleGainByVelocity(baseGain, detail.velocity);
			const freq = midiToFrequency(detail.midi);
			const attackSamples = Math.max(
				1,
				Math.floor((preset === "guitar" ? 0.004 : 0.025) * sampleRate),
			);
			const releaseSamples = Math.max(1, Math.floor(releaseSec * sampleRate));
			const releaseStart = Math.max(attackSamples, numSamples - releaseSamples);

			if (preset === "guitar") {
				const qDur = Math.ceil(renderDur * 4) / 4;
				const cacheKey = `${Math.round(freq * 10)}:${qDur}`;
				let buf = pluckCache.get(cacheKey);
				if (!buf) {
					buf = synthesizeGuitarPluckSamples(freq, sampleRate, qDur);
					pluckCache.set(cacheKey, buf);
				}
				let lp = 0;
				const lpAlpha = isMuted ? 0.25 : 0.68;
				for (let i = 0; i < numSamples && i < buf.length; i++) {
					lp = lp + lpAlpha * (buf[i] - lp);
					const env = computeAttackReleaseEnv(
						i,
						attackSamples,
						releaseStart,
						numSamples,
					);
					out[startSample + i] += lp * amp * env;
				}
			} else {
				const twoPi = 2 * Math.PI;
				const h2 = preset === "cello" || preset === "violin" ? 0.45 : 0.3;
				const h3 = preset === "cello" || preset === "violin" ? 0.22 : 0.12;
				for (let i = 0; i < numSamples; i++) {
					const t = i / sampleRate;
					const env = computeAttackReleaseEnv(
						i,
						attackSamples,
						releaseStart,
						numSamples,
					);
					const wave =
						0.7 * Math.sin(twoPi * freq * t) +
						h2 * Math.sin(twoPi * freq * 2 * t) +
						h3 * Math.sin(twoPi * freq * 3 * t);
					out[startSample + i] += wave * amp * 0.65 * env;
				}
			}
		});
	}

	// Soft limiter to prevent harsh clipping on dense chords
	for (let i = 0; i < out.length; i++) {
		const x = out[i];
		if (x > 0.98 || x < -0.98) {
			out[i] = Math.tanh(x);
		}
	}
	return out;
}

function computeAttackReleaseEnv(
	sampleIndex: number,
	attackSamples: number,
	releaseStart: number,
	numSamples: number,
): number {
	if (sampleIndex < attackSamples) return sampleIndex / attackSamples;
	if (sampleIndex >= releaseStart) {
		return (numSamples - sampleIndex) / Math.max(1, numSamples - releaseStart);
	}
	return 1;
}

/** Encodes mono [-1, 1] Float32 PCM samples into a 16-bit WAV buffer. */
export function encodeWavPcm16(
	samples: Float32Array,
	rawRate = 22050,
): Uint8Array {
	const sampleRate = clampSampleRate(rawRate);
	const dataBytes = samples.length * 2;
	const buffer = new ArrayBuffer(44 + dataBytes);
	const view = new DataView(buffer);
	const writeStr = (offset: number, str: string) => {
		for (let i = 0; i < str.length; i++) {
			view.setUint8(offset + i, str.charCodeAt(i));
		}
	};
	writeStr(0, "RIFF");
	view.setUint32(4, 36 + dataBytes, true);
	writeStr(8, "WAVE");
	writeStr(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, 1, true); // mono
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	writeStr(36, "data");
	view.setUint32(40, dataBytes, true);
	for (let i = 0; i < samples.length; i++) {
		const s = clamp(samples[i], -1, 1);
		view.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
	}
	return new Uint8Array(buffer);
}
