const assert = require('assert');

// Helper: isMusicXmlFile logic test
function isMusicXmlFile(file) {
  if (!file) return false;
  if (file.fileType === 'musicxml') return true;
  if (file.fileType === 'pdf') return false;
  const name = (file.name || '').toLowerCase();
  return name.endsWith('.xml') || name.endsWith('.musicxml') || name.endsWith('.mxl');
}

// Helper: normalizeMusicXmlForOsmd logic test
function normalizeMusicXmlForOsmd(xml) {
  let cleanXml = xml;

  // 1. Convert hidden rests (print-object="no") to forward elements for OSMD compatibility
  const hiddenRestPattern = /<note[^>]*print-object="no"[^>]*>[\s\S]*?<rest(?:\s*\/>|>[\s\S]*?<\/rest>)[\s\S]*?<duration>([\d.]+)<\/duration>[\s\S]*?<\/note>/gi;
  cleanXml = cleanXml.replace(hiddenRestPattern, (_, duration) => {
    return `<forward><duration>${duration}</duration></forward>`;
  });

  // 2. Remove empty <notations></notations> or empty <ornaments/> which can trigger OSMD errors
  cleanXml = cleanXml.replace(/<notations>\s*<\/notations>/gi, '');
  cleanXml = cleanXml.replace(/<ornaments>\s*<\/ornaments>/gi, '');

  // 3. Fix stray <alter> elements that are not inside <pitch>
  cleanXml = cleanXml.replace(/(<note[^>]*>)([\s\S]*?)(<\/note>)/gi, (fullNote, start, inner, end) => {
    if (/<alter>/i.test(inner) && !/<pitch>[\s\S]*?<alter>[\s\S]*?<\/pitch>/i.test(inner)) {
      const alterMatch = inner.match(/<alter>([^<]+)<\/alter>/i);
      if (alterMatch && /<pitch>/i.test(inner)) {
        const alterTag = alterMatch[0];
        const innerWithoutAlter = inner.replace(alterTag, '');
        const fixedPitch = innerWithoutAlter.replace(/(<step>[^<]+<\/step>)/i, `$1\n        ${alterTag}`);
        return `${start}${fixedPitch}${end}`;
      }
    }
    return fullNote;
  });

  return cleanXml;
}

// Helper: Loop calculation and wrapping logic
function computeLoopWrap(currentBeat, loopStartBeat, loopEndBeat) {
  if (currentBeat >= loopEndBeat) {
    return loopStartBeat;
  }
  return currentBeat;
}

console.log('🧪 Testing normalizeMusicXmlForOsmd...');
const sampleXml = '<note print-object="no"><rest/><duration>4</duration></note><notations></notations>';
const normalized = normalizeMusicXmlForOsmd(sampleXml);
assert.ok(normalized.includes('<forward><duration>4</duration></forward>'), 'Hidden rest conversion failed');
assert.ok(!normalized.includes('<notations></notations>'), 'Empty notations removal failed');
console.log('✅ normalizeMusicXmlForOsmd passed!');

console.log('🧪 Testing isMusicXmlFile...');
assert.strictEqual(isMusicXmlFile({ name: 'song.xml' }), true);
assert.strictEqual(isMusicXmlFile({ name: 'bach.musicxml' }), true);
assert.strictEqual(isMusicXmlFile({ name: 'piece.mxl' }), true);
assert.strictEqual(isMusicXmlFile({ name: 'sheet.pdf' }), false);
console.log('✅ isMusicXmlFile passed!');

console.log('🧪 Testing Loop bounds logic...');
assert.strictEqual(computeLoopWrap(16, 4, 16), 4, 'Loop boundary wrap failed at endBeat');
assert.strictEqual(computeLoopWrap(18, 4, 16), 4, 'Loop boundary wrap failed beyond endBeat');
assert.strictEqual(computeLoopWrap(8, 4, 16), 8, 'Loop calculation incorrect inside loop');
console.log('✅ Loop bounds logic passed!');

// Helper: Tied notes merging logic test
function processTiedNotes(rawNotes) {
  const scheduled = [];
  const activeTies = new Map();

  rawNotes.forEach(n => {
    const tieKey = `${n.voice}_${n.midi}`;
    if (n.isTieStop && activeTies.has(tieKey)) {
      const prev = activeTies.get(tieKey);
      prev.durationInBeats += n.durationInBeats;
      if (!n.isTieStart) {
        activeTies.delete(tieKey);
      }
    } else {
      const evt = { ...n };
      scheduled.push(evt);
      if (n.isTieStart) {
        activeTies.set(tieKey, evt);
      }
    }
  });

  return scheduled;
}

console.log('🧪 Testing Tied Notes duration merging...');
const sampleNotes = [
  { midi: 60, voice: 1, durationInBeats: 4, isTieStart: true, isTieStop: false },
  { midi: 60, voice: 1, durationInBeats: 2, isTieStart: false, isTieStop: true },
  { midi: 64, voice: 1, durationInBeats: 2, isTieStart: false, isTieStop: false },
];
const processed = processTiedNotes(sampleNotes);
assert.strictEqual(processed.length, 2, 'Tied continuation note should not produce separate sound event');
assert.strictEqual(processed[0].durationInBeats, 6, 'Tied note should merge durations (4 + 2 = 6)');
assert.strictEqual(processed[1].midi, 64, 'Subsequent note should remain intact');
console.log('✅ Tied Notes duration merging passed!');

console.log('🎉 All MusicXML unit tests passed successfully!');
