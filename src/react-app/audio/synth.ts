export type SoundPreset = "keys" | "pad" | "muted";

let sharedCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;

function getAudioContext(): { ctx: AudioContext; master: GainNode } | null {
	if (typeof window === "undefined") return null;
	const AudioCtx =
		window.AudioContext ||
		(window as unknown as { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext;
	if (!AudioCtx) return null;

	if (!sharedCtx) {
		sharedCtx = new AudioCtx();
		const compressor = sharedCtx.createDynamicsCompressor();
		compressor.threshold.value = -16;
		compressor.knee.value = 18;
		compressor.ratio.value = 4;
		compressor.attack.value = 0.005;
		compressor.release.value = 0.15;

		masterGain = sharedCtx.createGain();
		masterGain.gain.value = 0.7;

		masterGain.connect(compressor);
		compressor.connect(sharedCtx.destination);
	}

	if (sharedCtx.state === "suspended") {
		void sharedCtx.resume();
	}

	return { ctx: sharedCtx, master: masterGain! };
}

export function midiToFrequency(midi: number): number {
	return 440 * Math.pow(2, (midi - 69) / 12);
}

function scheduleVoice(
	ctx: AudioContext,
	destination: AudioNode,
	midi: number,
	startTime: number,
	duration: number,
	peakGain: number,
	preset: Exclude<SoundPreset, "muted">,
) {
	const freq = midiToFrequency(midi);
	const noteGain = ctx.createGain();
	const filter = ctx.createBiquadFilter();
	filter.type = "lowpass";

	if (preset === "keys") {
		const osc1 = ctx.createOscillator();
		const osc2 = ctx.createOscillator();
		const overtoneGain = ctx.createGain();

		osc1.type = "triangle";
		osc1.frequency.setValueAtTime(freq, startTime);

		osc2.type = "sine";
		osc2.frequency.setValueAtTime(freq * 2, startTime);
		overtoneGain.gain.setValueAtTime(0.18, startTime);
		overtoneGain.gain.exponentialRampToValueAtTime(0.03, startTime + 0.4);

		filter.frequency.setValueAtTime(Math.min(3600, freq * 6), startTime);
		filter.frequency.exponentialRampToValueAtTime(
			Math.max(550, freq * 2.2),
			startTime + Math.min(0.55, duration),
		);
		filter.Q.value = 0.8;

		const attack = 0.012;
		const release = 0.48;
		noteGain.gain.setValueAtTime(0.0001, startTime);
		noteGain.gain.linearRampToValueAtTime(peakGain, startTime + attack);
		noteGain.gain.exponentialRampToValueAtTime(
			peakGain * 0.45,
			startTime + Math.max(attack + 0.08, duration * 0.55),
		);
		noteGain.gain.exponentialRampToValueAtTime(
			0.0001,
			startTime + duration + release,
		);

		osc1.connect(filter);
		osc2.connect(overtoneGain);
		overtoneGain.connect(filter);
		filter.connect(noteGain);
		noteGain.connect(destination);

		osc1.start(startTime);
		osc2.start(startTime);
		osc1.stop(startTime + duration + release + 0.03);
		osc2.stop(startTime + duration + release + 0.03);
	} else {
		// Soft Pad
		const osc1 = ctx.createOscillator();
		const osc2 = ctx.createOscillator();

		osc1.type = "triangle";
		osc1.frequency.setValueAtTime(freq, startTime);
		osc1.detune.setValueAtTime(-6, startTime);

		osc2.type = "sine";
		osc2.frequency.setValueAtTime(freq, startTime);
		osc2.detune.setValueAtTime(6, startTime);

		filter.frequency.setValueAtTime(Math.min(1800, freq * 3.5), startTime);
		filter.Q.value = 0.5;

		const attack = 0.08;
		const release = 0.85;
		noteGain.gain.setValueAtTime(0.0001, startTime);
		noteGain.gain.linearRampToValueAtTime(peakGain * 0.8, startTime + attack);
		noteGain.gain.setValueAtTime(peakGain * 0.72, startTime + duration);
		noteGain.gain.exponentialRampToValueAtTime(
			0.0001,
			startTime + duration + release,
		);

		osc1.connect(filter);
		osc2.connect(filter);
		filter.connect(noteGain);
		noteGain.connect(destination);

		osc1.start(startTime);
		osc2.start(startTime);
		osc1.stop(startTime + duration + release + 0.05);
		osc2.stop(startTime + duration + release + 0.05);
	}
}

export function playSingleNote(
	midi: number,
	preset: SoundPreset = "keys",
	duration = 0.55,
): void {
	if (preset === "muted") return;
	const audio = getAudioContext();
	if (!audio) return;
	const now = audio.ctx.currentTime + 0.01;
	scheduleVoice(audio.ctx, audio.master, midi, now, duration, 0.24, preset);
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
		preset = "keys",
		duration = 0.95,
		arpeggiate = false,
		spreadSec,
	} = options;
	if (preset === "muted" || midiNotes.length === 0) return;
	const audio = getAudioContext();
	if (!audio) return;

	const now = audio.ctx.currentTime + 0.015;
	const perNoteGain = Math.min(0.22, 0.54 / Math.max(1, midiNotes.length));
	const spread = spreadSec ?? (arpeggiate ? 0.075 : 0.012);

	midiNotes.forEach((midi, idx) => {
		scheduleVoice(
			audio.ctx,
			audio.master,
			midi,
			now + idx * spread,
			duration,
			perNoteGain,
			preset,
		);
	});
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
		preset = "keys",
		stepMs,
		arpeggiate = false,
		spreadSec,
		onStep,
		onDone,
	} = options;
	let cancelled = false;
	const timers: number[] = [];

	steps.forEach((step, idx) => {
		const timerId = window.setTimeout(() => {
			if (cancelled) return;
			onStep?.(idx);
			if (step.midi.length === 1) {
				playSingleNote(
					step.midi[0],
					preset,
					step.durationSec ?? Math.max(0.28, (stepMs / 1000) * 0.9),
				);
			} else {
				playChordNotes(step.midi, {
					preset,
					duration: step.durationSec ?? Math.max(0.45, (stepMs / 1000) * 0.88),
					arpeggiate,
					spreadSec,
				});
			}
		}, idx * stepMs);
		timers.push(timerId);
	});

	const endTimer = window.setTimeout(() => {
		if (!cancelled) {
			onDone?.();
		}
	}, steps.length * stepMs);
	timers.push(endTimer);

	return () => {
		cancelled = true;
		for (const id of timers) {
			window.clearTimeout(id);
		}
	};
}
