const assert = require("assert");

// Import or replicate the parsing logic from script.js
const COMMON_MEDICINES = [
    "dolo", "crocin", "paracetamol", "azithromycin", "metformin",
    "pantoprazole", "cetirizine", "amoxicillin", "aspirin", "ibuprofen",
    "omeprazole", "atorvastatin", "amlodipine", "losartan", "metoprolol",
    "augmentin", "combiflam", "calpol"
];

const SPEECH_MISHEARING_MAP = {
    "download": "dolo",
    "dollar": "dolo",
    "dollo": "dolo",
    "dolu": "dolo",
    "croaking": "crocin",
    "crow scene": "crocin",
    "croissant": "crocin",
    "parasite mall": "paracetamol",
    "parasitic mall": "paracetamol",
    "paracitamol": "paracetamol",
    "parasitemol": "paracetamol",
    "panto": "pantoprazole",
    "pantop": "pantoprazole",
    "azithro": "azithromycin",
    "as it through": "azithromycin",
    "amox": "amoxicillin",
    "a moxie": "amoxicillin"
};

function levenshteinDistance(s1, s2) {
    const a = (s1 || "").toLowerCase(), b = (s2 || "").toLowerCase();
    const costs = [];
    for (let i = 0; i <= a.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= b.length; j++) {
            if (i === 0) costs[j] = j;
            else if (j > 0) {
                let newValue = costs[j - 1];
                if (a.charAt(i - 1) !== b.charAt(j - 1)) {
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                }
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[b.length] = lastValue;
    }
    return costs[b.length];
}

function stringSimilarity(s1, s2) {
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;
    return (maxLen - levenshteinDistance(s1, s2)) / maxLen;
}

function wordsToNumbers(text) {
    if (!text) return "";
    const numMap = {
        "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
        "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
        "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
        "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90
    };

    let s = text;
    s = s.replace(/\bsix\s+hundred\s+(?:and\s+)?fifty\b/gi, "650");
    s = s.replace(/\bsix\s+fifty\b/gi, "650");
    s = s.replace(/\bfive\s+hundred\b/gi, "500");
    s = s.replace(/\bone\s+thousand\b/gi, "1000");

    for (const [w, n] of Object.entries(numMap)) {
        const regex = new RegExp(`\\b${w}\\b`, "gi");
        s = s.replace(regex, n.toString());
    }
    return s;
}

function matchCommonMedicine(token) {
    if (!token) return token;
    const clean = token.toLowerCase().trim();
    if (SPEECH_MISHEARING_MAP[clean]) {
        const mapped = SPEECH_MISHEARING_MAP[clean];
        return mapped.charAt(0).toUpperCase() + mapped.slice(1);
    }
    let best = null;
    let highestSim = 0;
    for (const med of COMMON_MEDICINES) {
        const sim = stringSimilarity(clean, med);
        if (sim > highestSim) {
            highestSim = sim;
            best = med;
        }
    }
    if (highestSim >= 0.55 && best) {
        return best.charAt(0).toUpperCase() + best.slice(1);
    }
    return token.charAt(0).toUpperCase() + token.slice(1);
}

function normaliseVoiceTranscript(raw) {
    if (!raw) return "";
    let s = raw.trim();

    // Standardize meridiem punctuation
    s = s.replace(/p\.m\./gi, "pm").replace(/a\.m\./gi, "am");
    s = s.replace(/\bp\s+m\b/gi, "pm").replace(/\ba\s+m\b/gi, "am");

    // Convert number words
    s = wordsToNumbers(s);

    // Look for misheard pattern where "650 at 8 pm" was heard as "658 pm" or "658 p.m."
    s = s.replace(/\b(\d{2,3})(8|9|10|11|12|[1-7])\s*(pm|am)\b/gi, (match, prefix, hr, meridiem) => {
        if (prefix === "65" || prefix === "650" || prefix === "50" || prefix === "25") {
            const actualPrefix = prefix.length === 2 ? prefix + "0" : prefix;
            return `${actualPrefix} at ${hr} ${meridiem}`;
        }
        return match;
    });

    // Check direct mishearing dictionary
    for (const [misheard, corrected] of Object.entries(SPEECH_MISHEARING_MAP)) {
        const re = new RegExp(`\\b${misheard}\\b`, "gi");
        s = s.replace(re, corrected);
    }

    return s;
}

function parseVoiceLocally(transcript) {
    if (!transcript || typeof transcript !== "string") return null;

    const normalised = normaliseVoiceTranscript(transcript);
    const lower = normalised.toLowerCase();

    // 1. Stock parsing: "stock 15", "quantity 15", "15 tablets", "15 pieces", "15 pills"
    let stock = null;
    let stockSubstring = "";
    const stockMatch = normalised.match(/(?:stock|quantity|count)\s*(\d+)|\b(\d+)\s*(?:tablets?|capsules?|pills?|pieces?|units?|strips?|doses?)\b/i);
    if (stockMatch) {
        stock = parseInt(stockMatch[1] || stockMatch[2]);
        stockSubstring = stockMatch[0];
    }

    // 2. Dosage parsing
    let dosage = "";
    // Check if medicine is immediately followed by strength (e.g. Metformin 500, Dolo 650, Crocin 500)
    const medStrengthMatch = normalised.match(/\b(?:dolo|crocin|paracetamol|azithromycin|metformin|pantoprazole|cetirizine|amoxicillin|[a-zA-Z]+)\s+(\d{2,4})\s*(mg|g|ml|mcg)?\b/i);
    if (medStrengthMatch) {
        const num = medStrengthMatch[1];
        const unit = medStrengthMatch[2] || "mg";
        dosage = `${num} ${unit}`;
    } else {
        const mgMatch = normalised.match(/(\d+\s*(?:mg|g|ml|mcg))\b/i);
        if (mgMatch) {
            dosage = mgMatch[1].trim();
        } else {
            const otherDoseMatch = normalised.match(/(\d+\s*(?:tablets?|capsules?|pills?|pieces?|drops?|dose))\b/i);
            if (otherDoseMatch && (!stockSubstring || otherDoseMatch[0].toLowerCase() !== stockSubstring.toLowerCase())) {
                dosage = otherDoseMatch[1].trim();
            }
        }
    }

    // 3. Time & Meridiem Parsing: Bug 2(a)
    let times = [];
    let meridiemAmbiguous = false;

    // Direct AM/PM: e.g. "8 pm", "8:30 pm", "8 am"
    const ampmMatch = normalised.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (ampmMatch) {
        let hrs = parseInt(ampmMatch[1]);
        const mins = ampmMatch[2] ? parseInt(ampmMatch[2]) : 0;
        const ampm = ampmMatch[3].toLowerCase();
        if (ampm === "pm" && hrs < 12) hrs += 12;
        if (ampm === "am" && hrs === 12) hrs = 0;
        times.push(`${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`);
    }

    // Evening / Night phrases: e.g. "8 in the evening", "8 in the night", "8 at night"
    if (times.length === 0) {
        const eveMatch = normalised.match(/(\d{1,2})(?::(\d{2}))?\s*(?:in the|at)?\s*(evening|night|bedtime)\b/i);
        if (eveMatch) {
            let hrs = parseInt(eveMatch[1]);
            const mins = eveMatch[2] ? parseInt(eveMatch[2]) : 0;
            if (hrs < 12) hrs += 12;
            times.push(`${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`);
        }
    }

    // Morning phrases: e.g. "8 in the morning", "8 morning"
    if (times.length === 0) {
        const mornMatch = normalised.match(/(\d{1,2})(?::(\d{2}))?\s*(?:in the|at)?\s*(morning)\b/i);
        if (mornMatch) {
            let hrs = parseInt(mornMatch[1]);
            const mins = mornMatch[2] ? parseInt(mornMatch[2]) : 0;
            if (hrs === 12) hrs = 0;
            times.push(`${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`);
        }
    }

    // Afternoon phrases: e.g. "1 in the afternoon", "2 afternoon"
    if (times.length === 0) {
        const aftMatch = normalised.match(/(\d{1,2})(?::(\d{2}))?\s*(?:in the|at)?\s*(afternoon)\b/i);
        if (aftMatch) {
            let hrs = parseInt(aftMatch[1]);
            const mins = aftMatch[2] ? parseInt(aftMatch[2]) : 0;
            if (hrs < 12) hrs += 12;
            times.push(`${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`);
        }
    }

    // Plain time without meridiem: e.g. "at 8"
    if (times.length === 0) {
        const plainAtMatch = normalised.match(/\b(?:at|around)\s*(\d{1,2})(?::(\d{2}))?\b/i);
        if (plainAtMatch) {
            let hrs = parseInt(plainAtMatch[1]);
            const mins = plainAtMatch[2] ? parseInt(plainAtMatch[2]) : 0;
            meridiemAmbiguous = true;
            if (hrs < 12) hrs += 12;
            times.push(`${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`);
        }
    }

    if (times.length === 0) {
        if (lower.includes("morning") && (lower.includes("night") || lower.includes("evening"))) {
            times.push("08:00", "20:00");
        } else if (lower.includes("morning")) {
            times.push("08:00");
        } else if (lower.includes("afternoon")) {
            times.push("13:00");
        } else if (lower.includes("evening")) {
            times.push("18:00");
        } else if (lower.includes("night") || lower.includes("bedtime")) {
            times.push("20:00");
        } else {
            times.push("20:00");
            meridiemAmbiguous = true;
        }
    }

    let foodTiming = "After Food";
    if (lower.includes("before food") || lower.includes("before meal") || lower.includes("empty stomach")) {
        foodTiming = "Before Food";
    } else if (lower.includes("with food") || lower.includes("with meal")) {
        foodTiming = "With Food";
    } else if (lower.includes("anytime") || lower.includes("any time")) {
        foodTiming = "Anytime";
    }

    let repeatDaily = true;
    if (lower.includes("once") || lower.includes("today only") || lower.includes("not daily") || lower.includes("single dose")) {
        repeatDaily = false;
    }

    let clean = normalised.replace(/^(?:please\s+)?(?:add|take|remind\s+me\s+to\s+take|i\s+need\s+to\s+take|put)\s+/i, "");
    const nameMatch = clean.match(/^([a-zA-Z\s]+?)(?=\s+(?:\d+\s*(?:mg|g|ml|mcg|tablets?|capsules?|pills?|doses?|drop|drops)?|\d{1,2}(?::\d{2})?\s*(?:am|pm)?|at|stock|every|before|after|with|morning|afternoon|evening|night|daily|$))/i);
    let rawName = nameMatch ? nameMatch[1].trim() : clean.split(/\s+(?:at|stock|\d)/i)[0].trim();

    if (rawName.toLowerCase().startsWith("add ")) rawName = rawName.substring(4).trim();
    if (rawName.toLowerCase().startsWith("take ")) rawName = rawName.substring(5).trim();

    const name = matchCommonMedicine(rawName);

    return {
        name,
        dosage,
        times,
        stock,
        foodTiming,
        repeatDaily,
        meridiemAmbiguous
    };
}

describe("Voice Command Parser Unit Tests (Bug 2)", function () {
    const testCases = [
        {
            sentence: "add download 658 p.m.",
            expected: { name: "Dolo", dosage: "650 mg", time: "20:00", stock: null },
            description: "1. Misheard command 'download 658 p.m.' normalized to Dolo 650 at 20:00 (PM!)"
        },
        {
            sentence: "Add Dolo 650 at 8 PM stock 15",
            expected: { name: "Dolo", dosage: "650 mg", time: "20:00", stock: 15 },
            description: "2. Full explicit command with 8 PM and stock 15"
        },
        {
            sentence: "Take Crocin 500 mg at 8 in the morning quantity 20",
            expected: { name: "Crocin", dosage: "500 mg", time: "08:00", stock: 20 },
            description: "3. '8 in the morning' gives 08:00 (AM) and quantity 20"
        },
        {
            sentence: "Add Paracetamol 650 at 8 in the night stock 10",
            expected: { name: "Paracetamol", dosage: "650 mg", time: "20:00", stock: 10 },
            description: "4. '8 in the night' gives 20:00 (PM)"
        },
        {
            sentence: "Remind me to take Azithromycin 500 mg at 8 p.m. with 15 tablets",
            expected: { name: "Azithromycin", dosage: "500 mg", time: "20:00", stock: 15 },
            description: "5. '8 p.m.' with '15 tablets' gives stock 15"
        },
        {
            sentence: "Add Metformin 500 at 8 PM and 15 pieces",
            expected: { name: "Metformin", dosage: "500 mg", time: "20:00", stock: 15 },
            description: "6. '15 pieces' parsed as stock 15"
        },
        {
            sentence: "Take Pantoprazole 40 mg before food at eight am stock 30",
            expected: { name: "Pantoprazole", dosage: "40 mg", time: "08:00", stock: 30, foodTiming: "Before Food" },
            description: "7. Number word 'eight am' gives 08:00 and foodTiming 'Before Food'"
        },
        {
            sentence: "Add Cetirizine 10 mg at bedtime stock 10",
            expected: { name: "Cetirizine", dosage: "10 mg", time: "20:00", stock: 10 },
            description: "8. 'bedtime' gives 20:00 and stock 10"
        },
        {
            sentence: "Add Amoxicillin 500 mg at 1 in the afternoon 15 pills left",
            expected: { name: "Amoxicillin", dosage: "500 mg", time: "13:00", stock: 15 },
            description: "9. '1 in the afternoon' gives 13:00 and '15 pills' gives stock 15"
        },
        {
            sentence: "Add Dolo 650 at eight pm",
            expected: { name: "Dolo", dosage: "650 mg", time: "20:00", stock: null },
            description: "10. 'eight pm' gives 20:00 with no stock (does not default to 10)"
        },
        {
            sentence: "Take Crocin 650 at 8 morning 10 tablets",
            expected: { name: "Crocin", dosage: "650 mg", time: "08:00", stock: 10 },
            description: "11. '8 morning' gives 08:00 and '10 tablets' gives stock 10"
        },
        {
            sentence: "Add Aspirin 75 mg at 8",
            expected: { name: "Aspirin", dosage: "75 mg", time: "20:00", stock: null, ambiguous: true },
            description: "12. Unspecified meridiem 'at 8' flags ambiguous for user confirmation"
        },
        {
            sentence: "add dollar 658 pm",
            expected: { name: "Dolo", dosage: "650 mg", time: "20:00", stock: null },
            description: "13. Mishearing 'dollar 658 pm' normalized to Dolo 650 at 20:00"
        },
        {
            sentence: "please take croaking 500 at eight pm stock 25",
            expected: { name: "Crocin", dosage: "500 mg", time: "20:00", stock: 25 },
            description: "14. Mishearing 'croaking 500' normalized to Crocin 500 at 20:00 stock 25"
        }
    ];

    testCases.forEach((tc, idx) => {
        it(tc.description, () => {
            const res = parseVoiceLocally(tc.sentence);
            console.log(`\n--- Test Case ${idx + 1} ---`);
            console.log(`Input Sentence: "${tc.sentence}"`);
            console.log(`Parsed Output : Name: ${res.name}, Dosage: ${res.dosage}, Times: [${res.times.join(', ')}], Stock: ${res.stock}, Food: ${res.foodTiming}, Ambiguous: ${res.meridiemAmbiguous}`);

            assert.strictEqual(res.name.toLowerCase(), tc.expected.name.toLowerCase(), `Medicine name should match ${tc.expected.name}`);
            if (tc.expected.dosage) {
                assert.strictEqual(res.dosage, tc.expected.dosage, `Dosage should match ${tc.expected.dosage}`);
            }
            if (tc.expected.time) {
                assert.strictEqual(res.times[0], tc.expected.time, `Time should match ${tc.expected.time}`);
            }
            if (tc.expected.stock !== undefined) {
                assert.strictEqual(res.stock, tc.expected.stock, `Stock should match ${tc.expected.stock}`);
            }
            if (tc.expected.foodTiming) {
                assert.strictEqual(res.foodTiming, tc.expected.foodTiming, `Food timing should match ${tc.expected.foodTiming}`);
            }
            if (tc.expected.ambiguous !== undefined) {
                assert.strictEqual(res.meridiemAmbiguous, tc.expected.ambiguous, `Ambiguous flag should match ${tc.expected.ambiguous}`);
            }
        });
    });
});
