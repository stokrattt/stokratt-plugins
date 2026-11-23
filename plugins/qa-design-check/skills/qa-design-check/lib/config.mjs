import { createHash } from 'node:crypto';

export const VERSION = '0.2.0';

export const config = {
    // Tolerances. These are calibration knobs, real pages need tuning.
    tolerance: {
        geometry: 2, // px, only applied when element text matches
        spacing: 1, // padding, gap
        radius: 1,
        border: 1,
        fontSize: 0.5,
        lineHeight: 0.5,
        letterSpacing: 0.1,
    },

    // Matching thresholds
    iouThreshold: 0.6,
    minAnchors: 3,

    /**
     * Geometry deltas at or below this are dropped entirely. 0 means report
     * everything the per-property tolerances let through, which is the default:
     * the tolerances above are already the noise filter. Raise it to 3 to get the
     * consequence-only reporting, cumulative drift is
     * summed per element before the floor applies, so raising it never hides a
     * block that walked off by 10px in five 2px steps.
     */
    geometryFloor: 0,

    // A geometric delta this large stops being cosmetic, bump one severity level.
    escalateDelta: 24,

    // A frame whose unique-text ratio is below this is a design-system component
    // with placeholder labels, not a screen. Anchoring cannot work on it.
    placeholderUniqueRatio: 0.2,
    placeholderWords: [
        'title',
        'button',
        'description',
        'label',
        'text',
        'paragraph',
        'subtitle',
        'caption',
        'placeholder',
        'heading',
    ],

    // Repeated identical deltas across N+ elements are one systemic issue, not N bugs
    systemicThreshold: 5,

    // Max clicks tried when hunting for the state shown in the mock
    maxStateAttempts: 4,

    /**
     * Reverse pass. The DOM holds hundreds of visual elements where the mock holds
     * dozens, so an unfiltered "on the page, not in the mock" list is noise. Only
     * elements this substantial, inside the area the mock actually covers, count.
     */
    reverse: {
        minArea: 24 * 24,
        // An unmatched box that all but contains (or is contained by) a matched one is
        // a wrapper around something we already compared, not an extra element.
        wrapperOverlap: 0.9,
        maxReported: 25,
    },

    /**
     * Consistency. Groups come from the mock: nodes at the same path inside repeated
     * instances of one component are the same semantic element. Two members already
     * disagree meaningfully; the group is only skipped when the mock itself differs.
     */
    consistency: {
        minGroup: 2,
        maxReported: 40,
    },

    // Annotated screenshots per run. Over the cap the rest keep their numbers, not a picture.
    maxScreenshots: 6,
};

export const SEVERITIES = ['Critical', 'Major', 'Normal', 'Minor', 'Trivial'];

export const configHash = createHash('sha256')
    .update(JSON.stringify(config))
    .digest('hex')
    .slice(0, 6);
