// Equal temperament, A4 = 440 Hz at MIDI 69.
//
// Audio domain knowledge with no dependencies of its own: a second sound source
// must not duplicate it, and the UI must not have to know it. Its own module so
// that the engine and a voice can both have it without one importing the other.

export function noteToFrequency(midiNumber) {
    return 440 * 2 ** ((midiNumber - 69) / 12);
}
