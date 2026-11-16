export type InstrumentVoice = "piano" | "guitar" | "cello" | "pad";
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
	primarySource: AudioScheduledSourceNode,
	noteGain: GainNode,
): void {
	activeVoiceGains.add(noteGain);
	activeVoiceSources.add(primarySource);
	primarySource.onended = () => {
		activeVoiceGains.delete(noteGain);
		activeVoiceSources.delete(primarySource);
		try {
			noteGain.disconnect();
		} catch {
			// Ignore if already disconnected
		}
	};
}

function registerAuxSource(source: AudioScheduledSourceNode): void {
	activeVoiceSources.add(source);
	source.onended = () => {
		activeVoiceSources.delete(source);
		try {
			source.disconnect();
		} catch {
			// Ignore if already disconnected
		}
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
		} catch {
			// Ignore if node was already released
		}
	}
	for (const source of activeVoiceSources) {
		try {
			source.stop(now + 0.035);
		} catch {
			// Ignore if source already stopped or unavailable
		}
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

function isValidMidi(midi: number): boolean {
	return Number.isFinite(midi) && midi >= 0 && midi <= 127;
}

export function midiToFrequency(midi: number): number {
	const clamped = Number.isFinite(midi) ? Math.max(0, Math.min(127, midi)) : 69;
	return 440 * Math.pow(2, (clamped - 69) / 12);
}

export function getDefaultChordSpread(
	preset: SoundPreset,
	arpeggiate: boolean,
): number {
	if (arpeggiate) return preset === "piano" || preset === "pad" ? 0.075 : 0.08;
	if (preset === "cello") return 0.058;
	if (preset === "guitar") return 0.038;
	return 0.01;
}

/**
 * Warm acoustic guitar pluck via Karplus-Strong waveguide synthesis
 * combining a soundhole triangular string-displacement model with
 * filtered finger-pluck texture, wood damping, and Thiran fractional-delay tuning.
 */
export function synthesizeGuitarPluckSamples(
	freq: number,
	sampleRate: number,
	totalSeconds: number,
): Float32Array {
	const fs = Math.max(8000, sampleRate);
	const clampedFreq = Math.max(40, Math.min(fs * 0.25, freq));
	const numSamples = Math.max(
		256,
		Math.floor(fs * Math.max(0.1, totalSeconds)),
	);
	const out = new Float32Array(numSamples);

	const normPitch = Math.max(
		0,
		Math.min(1, (Math.log2(clampedFreq) - Math.log2(82.41)) / 3),
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
		out[i] = Math.max(-1, Math.min(1, ap * env));
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

function schedulePianoVoice(
	engine: AudioEngine,
	midi: number,
	startTime: number,
	duration: number,
	peakGain: number,
) {
	const { ctx, master, noiseBuffer } = engine;
	const freq = midiToFrequency(midi);
	const pitchNorm = Math.max(0, Math.min(1, (midi - 21) / 87));

	const stringFilter = createFilter(
		ctx,
		"lowpass",
		Math.min(5800, Math.max(950, freq * (9.5 - pitchNorm * 4))),
		0.7,
	);
	stringFilter.frequency.exponentialRampToValueAtTime(
		Math.min(3200, Math.max(550, freq * 4.6)),
		startTime + 0.075,
	);
	stringFilter.frequency.exponentialRampToValueAtTime(
		Math.max(320, freq * 2.0),
		startTime + Math.min(0.75, duration + 0.18),
	);

	const boardResonance = createFilter(ctx, "peaking", 230, 1.1, 2.4);
	const release = 0.65 - pitchNorm * 0.24;
	const stopTime = startTime + duration + release;

	const noteGain = ctx.createGain();
	noteGain.gain.setValueAtTime(0.0001, startTime);
	noteGain.gain.linearRampToValueAtTime(peakGain * 1.12, startTime + 0.005);
	noteGain.gain.exponentialRampToValueAtTime(peakGain * 0.68, startTime + 0.08);
	noteGain.gain.exponentialRampToValueAtTime(
		peakGain * 0.36,
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
		if (idx === 0) registerVoiceCleanup(osc, noteGain);
		else registerAuxSource(osc);
	});

	const hammerSrc = ctx.createBufferSource();
	hammerSrc.buffer = noiseBuffer;
	const hammerFilter = createFilter(
		ctx,
		"bandpass",
		Math.min(2400, Math.max(420, freq * 4.2)),
		1.6,
	);
	const hammerGain = ctx.createGain();
	hammerGain.gain.setValueAtTime(0.0001, startTime);
	hammerGain.gain.linearRampToValueAtTime(peakGain * 0.12, startTime + 0.003);
	hammerGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.025);

	chainNodes(hammerSrc, hammerFilter, hammerGain, boardResonance);
	chainNodes(stringFilter, boardResonance, noteGain, master);

	hammerSrc.start(startTime, ((midi * 17) % 100) * 0.002, 0.03);
	hammerSrc.stop(startTime + 0.035);
	registerAuxSource(hammerSrc);
}

function scheduleGuitarVoice(
	engine: AudioEngine,
	midi: number,
	startTime: number,
	duration: number,
	peakGain: number,
) {
	const { ctx, master, noiseBuffer } = engine;
	const freq = midiToFrequency(midi);
	const release = 1.15;
	const stopTime = startTime + duration + release;

	const src = ctx.createBufferSource();
	src.buffer = getGuitarPluckBuffer(
		ctx,
		freq,
		Math.max(duration + release, 2.2),
	);

	// Acoustic dreadnought/concert body voicing: broad air + spruce warmth, gentle mid clarity
	const bodyHPF = createFilter(ctx, "highpass", 68, 0.7);
	const airWarmth = createFilter(ctx, "peaking", 108, 1.05, 2.4);
	const topWood = createFilter(ctx, "peaking", 235, 0.95, 2.1);
	const boxCleanup = createFilter(ctx, "peaking", 450, 0.85, -2.4);
	const woodPresence = createFilter(ctx, "peaking", 1420, 0.75, 1.2);
	const bodyLPF = createFilter(
		ctx,
		"lowpass",
		Math.min(3900, Math.max(2100, freq * 8.5)),
		0.6,
	);
	bodyLPF.frequency.exponentialRampToValueAtTime(
		Math.min(1850, Math.max(950, freq * 3.8)),
		startTime + Math.min(0.42, duration * 0.65),
	);

	const noteGain = ctx.createGain();
	const ksGain = peakGain * 1.42;
	noteGain.gain.setValueAtTime(0.0001, startTime);
	noteGain.gain.linearRampToValueAtTime(ksGain, startTime + 0.0035);
	noteGain.gain.exponentialRampToValueAtTime(
		ksGain * 0.72,
		startTime + Math.min(0.28, Math.max(0.05, duration * 0.45)),
	);
	noteGain.gain.exponentialRampToValueAtTime(
		ksGain * 0.42,
		startTime + Math.max(0.08, duration),
	);
	noteGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

	// Subtle woody finger/pick contact transient
	const pluckSrc = ctx.createBufferSource();
	pluckSrc.buffer = noiseBuffer;
	const pluckFilter = createFilter(
		ctx,
		"bandpass",
		Math.min(1150, Math.max(480, freq * 3.4)),
		1.4,
	);
	const pluckGain = ctx.createGain();
	pluckGain.gain.setValueAtTime(0.0001, startTime);
	pluckGain.gain.linearRampToValueAtTime(peakGain * 0.055, startTime + 0.002);
	pluckGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.015);
	chainNodes(pluckSrc, pluckFilter, pluckGain, topWood);

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
	pluckSrc.start(startTime, ((midi * 19) % 100) * 0.002, 0.02);
	pluckSrc.stop(startTime + 0.025);
	registerAuxSource(pluckSrc);
}

function scheduleCelloVoice(
	engine: AudioEngine,
	midi: number,
	startTime: number,
	duration: number,
	peakGain: number,
) {
	const { ctx, master, noiseBuffer } = engine;
	const freq = midiToFrequency(midi);
	const isShort = duration <= 0.42;
	const attack = isShort ? Math.max(0.025, duration * 0.14) : 0.078;
	const release = isShort ? 0.26 : 0.44;
	const stopTime = startTime + duration + release;

	const bowLPF = createFilter(ctx, "lowpass", Math.max(360, freq * 2.4), 0.75);
	bowLPF.frequency.exponentialRampToValueAtTime(
		Math.min(2500, Math.max(720, freq * 7.2)),
		startTime + attack + 0.04,
	);
	bowLPF.frequency.exponentialRampToValueAtTime(
		Math.min(1850, Math.max(520, freq * 4.5)),
		startTime + Math.max(attack + 0.12, duration),
	);

	const vibratoLfo = ctx.createOscillator();
	vibratoLfo.type = "sine";
	vibratoLfo.frequency.setValueAtTime(5.2, startTime);
	const vibratoDepth = ctx.createGain();
	vibratoDepth.gain.setValueAtTime(0, startTime);
	vibratoDepth.gain.setValueAtTime(
		0,
		startTime + Math.min(0.13, duration * 0.35),
	);
	vibratoDepth.gain.linearRampToValueAtTime(
		isShort ? 3.5 : 11.5,
		startTime + Math.min(0.42, Math.max(0.2, duration * 0.72)),
	);
	vibratoLfo.connect(vibratoDepth);

	const noteGain = ctx.createGain();
	noteGain.gain.setValueAtTime(0.0001, startTime);
	noteGain.gain.linearRampToValueAtTime(peakGain * 0.88, startTime + attack);
	noteGain.gain.linearRampToValueAtTime(
		peakGain * 0.94,
		startTime + Math.max(attack + 0.04, duration * 0.82),
	);
	noteGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

	(
		[
			["sawtooth", 0.7],
			["triangle", 0.36],
		] as const
	).forEach(([type, gainVal], idx) => {
		const osc = ctx.createOscillator();
		const g = ctx.createGain();
		osc.type = type;
		osc.frequency.setValueAtTime(freq, startTime);
		g.gain.setValueAtTime(gainVal, startTime);
		vibratoDepth.connect(osc.detune);
		chainNodes(osc, g, bowLPF);
		osc.start(startTime);
		osc.stop(stopTime + 0.04);
		if (idx === 0) registerVoiceCleanup(osc, noteGain);
		else registerAuxSource(osc);
	});

	const bowNoise = ctx.createBufferSource();
	bowNoise.buffer = noiseBuffer;
	const bowBandpass = createFilter(
		ctx,
		"bandpass",
		Math.min(1300, Math.max(520, freq * 5)),
		2.2,
	);
	const bowNoiseGain = ctx.createGain();
	const noiseDur = isShort ? 0.04 : 0.075;
	bowNoiseGain.gain.setValueAtTime(0.0001, startTime);
	bowNoiseGain.gain.linearRampToValueAtTime(
		peakGain * 0.055,
		startTime + noiseDur * 0.35,
	);
	bowNoiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + noiseDur);
	chainNodes(bowNoise, bowBandpass, bowNoiseGain, bowLPF);

	// Cello body formants: A0 f-hole air, B1 chest wood, box scoop, singing bridge hill
	const airChamber = createFilter(ctx, "peaking", 78, 1.8, 4.0);
	const chestBody = createFilter(ctx, "peaking", 195, 2.1, 4.2);
	const midScoop = createFilter(ctx, "peaking", 490, 1.4, -3.2);
	const bridgeHill = createFilter(ctx, "peaking", 1150, 1.5, 3.0);

	chainNodes(
		bowLPF,
		airChamber,
		chestBody,
		midScoop,
		bridgeHill,
		noteGain,
		master,
	);

	vibratoLfo.start(startTime);
	bowNoise.start(startTime, ((midi * 23) % 100) * 0.002, noiseDur + 0.01);
	vibratoLfo.stop(stopTime + 0.04);
	bowNoise.stop(startTime + noiseDur + 0.02);
	registerAuxSource(vibratoLfo);
	registerAuxSource(bowNoise);
}

function schedulePadVoice(
	engine: AudioEngine,
	midi: number,
	startTime: number,
	duration: number,
	peakGain: number,
) {
	const { ctx, master } = engine;
	const freq = midiToFrequency(midi);
	const filter = createFilter(
		ctx,
		"lowpass",
		Math.min(1800, Math.max(520, freq * 3.5)),
		0.5,
	);
	const noteGain = ctx.createGain();
	const stopTime = startTime + duration + 0.85;

	noteGain.gain.setValueAtTime(0.0001, startTime);
	noteGain.gain.linearRampToValueAtTime(peakGain * 0.8, startTime + 0.08);
	noteGain.gain.setValueAtTime(peakGain * 0.72, startTime + duration);
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
		if (idx === 0) registerVoiceCleanup(osc, noteGain);
		else registerAuxSource(osc);
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
) {
	switch (preset) {
		case "piano":
			schedulePianoVoice(engine, midi, startTime, duration, peakGain);
			break;
		case "guitar":
			scheduleGuitarVoice(engine, midi, startTime, duration, peakGain);
			break;
		case "cello":
			scheduleCelloVoice(engine, midi, startTime, duration, peakGain);
			break;
		case "pad":
			schedulePadVoice(engine, midi, startTime, duration, peakGain);
			break;
	}
}

const LOOKAHEAD_SEC = 0.13;
const SCHEDULER_INTERVAL_MS = 25;
const AUDIO_LEAD_SEC = 0.015;

function scheduleChordAtCtxTime(
	engine: AudioEngine,
	midiNotes: number[],
	atCtxTime: number,
	durationSec: number,
	preset: InstrumentVoice,
	arpeggiate: boolean,
	spreadSec?: number,
): void {
	const validNotes = midiNotes.filter(isValidMidi);
	if (validNotes.length === 0) return;
	if (validNotes.length === 1) {
		scheduleVoice(engine, validNotes[0], atCtxTime, durationSec, 0.24, preset);
		return;
	}
	const perNoteGain = Math.min(0.22, 0.54 / validNotes.length);
	const spread = spreadSec ?? getDefaultChordSpread(preset, arpeggiate);
	validNotes.forEach((midi, idx) => {
		scheduleVoice(
			engine,
			midi,
			atCtxTime + idx * spread,
			durationSec,
			perNoteGain,
			preset,
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

export interface TimedSequenceStep {
	midi: number[];
	atMs: number;
	durationSec: number;
	spreadSec?: number;
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
	if (typeof window === "undefined") {
		return () => {};
	}

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
	let schedulerTimerId: number | null = null;
	let initialTimerId: number | null = null;

	const cleanupTimers = () => {
		if (initialTimerId !== null) {
			window.clearTimeout(initialTimerId);
			initialTimerId = null;
		}
		if (schedulerTimerId !== null) {
			window.clearInterval(schedulerTimerId);
			schedulerTimerId = null;
		}
		if (rafId !== null && typeof window.cancelAnimationFrame === "function") {
			window.cancelAnimationFrame(rafId);
			rafId = null;
		}
	};

	const cancel = () => {
		cancelled = true;
		cleanupTimers();
		stopAllAudio();
	};

	if (steps.length === 0 || startOffsetMs >= computedEndMs) {
		initialTimerId = window.setTimeout(() => {
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
			typeof window.requestAnimationFrame === "function"
		) {
			rafId = window.requestAnimationFrame(runRaf);
		}
	};

	initialTimerId = window.setTimeout(() => {
		if (cancelled || finished) return;
		tick();
		if (cancelled || finished) return;
		schedulerTimerId = window.setInterval(tick, SCHEDULER_INTERVAL_MS);
		if (typeof window.requestAnimationFrame === "function") {
			rafId = window.requestAnimationFrame(runRaf);
		}
	}, 0);

	return cancel;
}
