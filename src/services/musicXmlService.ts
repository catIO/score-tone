/**
 * MusicXML Processing & Normalization Service
 * Handles parsing, metadata extraction, sanitization, and polyphonic voice normalization.
 */

export interface MusicXmlMetadata {
  title?: string;
  composer?: string;
  timeSignature?: {
    beats: number;
    beatType: number;
  };
  tempo?: number; // BPM
  divisions: number;
  totalMeasures: number;
  partCount: number;
}

// Declare JSZip global
declare global {
  interface Window {
    JSZip?: any;
    opensheetmusicdisplay?: any;
  }
}

/**
 * Extract clean string from Blob, ArrayBuffer, or text (handles plain XML and compressed .mxl)
 */
export async function readMusicXmlText(input: Blob | ArrayBuffer | string): Promise<string> {
  let xmlString = '';

  // 1. Check if input is a binary Blob or ArrayBuffer
  if (typeof input !== 'string') {
    const arrayBuffer = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // Check for ZIP magic number (PK\x03\x04 or PK\x05\x06)
    const isZip = uint8.length >= 4 && uint8[0] === 0x50 && uint8[1] === 0x4b;

    if (isZip) {
      const JSZipClass = window.JSZip;
      if (!JSZipClass) {
        throw new Error('JSZip library is required to open compressed MusicXML (.mxl) files.');
      }

      const zip = await JSZipClass.loadAsync(arrayBuffer);

      // Look for META-INF/container.xml
      let rootPath: string | null = null;
      const containerFile = zip.file('META-INF/container.xml') || zip.file('meta-inf/container.xml');
      if (containerFile) {
        const containerXml = await containerFile.async('text');
        const match = containerXml.match(/<rootfile[^>]*full-path=["']([^"']+)["']/i);
        if (match) {
          rootPath = match[1];
        }
      }

      if (rootPath && zip.file(rootPath)) {
        xmlString = await zip.file(rootPath).async('text');
      } else {
        // Fallback: search for first .xml / .musicxml in archive
        const candidate = Object.keys(zip.files).find(
          path => !path.startsWith('__MACOSX') && !path.includes('container.xml') && (path.endsWith('.xml') || path.endsWith('.musicxml'))
        );
        if (candidate) {
          xmlString = await zip.file(candidate).async('text');
        } else {
          throw new Error('No valid MusicXML score found inside .mxl archive.');
        }
      }
    } else {
      // Plain text XML in Blob
      const decoder = new TextDecoder('utf-8');
      xmlString = decoder.decode(uint8);
    }
  } else {
    xmlString = input;
  }

  // Strip JSON wrapper if it was packaged in JSON
  xmlString = xmlString.trim();
  if (xmlString.startsWith('{') || xmlString.startsWith('[')) {
    try {
      const parsed = JSON.parse(xmlString);
      if (parsed.musicXml) {
        xmlString = parsed.musicXml;
      }
    } catch {
      // Not JSON, continue
    }
  }

  // Remove markdown code block markers if present
  const codeBlockMatch = xmlString.match(/```(?:xml|musicxml)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    xmlString = codeBlockMatch[1].trim();
  }

  return xmlString;
}

/**
 * Normalizes MusicXML to ensure clean rendering in OpenSheetMusicDisplay
 */
export function normalizeMusicXmlForOsmd(xml: string): string {
  let cleanXml = xml;

  // 1. Clean AI generation artifacts & dotted note types
  cleanXml = cleanXml.replace(/<!DOCTYPE\s+score\s*-\s*partwise/gi, '<!DOCTYPE score-partwise');
  cleanXml = cleanXml.replace(/<score\s*-\s*partwise/gi, '<score-partwise');
  cleanXml = cleanXml.replace(/<\/score\s*-\s*partwise/gi, '</score-partwise');

  // Fix dotted types (e.g. <type>dotted-half</type> -> <type>half</type><dot/>)
  cleanXml = cleanXml
    .replace(/<type>dotted-half<\/type>/g, '<type>half</type><dot/>')
    .replace(/<type>dotted-quarter<\/type>/g, '<type>quarter</type><dot/>')
    .replace(/<type>dotted-eighth<\/type>/g, '<type>eighth</type><dot/>')
    .replace(/<type>dotted-whole<\/type>/g, '<type>whole</type><dot/>');

  // Fix spelled-out 16th and 32nd note types
  cleanXml = cleanXml
    .replace(/<type>sixteenth<\/type>/g, '<type>16th</type>')
    .replace(/<type>thirty-second<\/type>/g, '<type>32nd</type>')
    .replace(/<type>thirtysecond<\/type>/g, '<type>32nd</type>');

  // 2. Convert hidden rests (print-object="no") to forward elements for OSMD compatibility
  const hiddenRestPattern = /<note[^>]*print-object="no"[^>]*>[\s\S]*?<rest(?:\s*\/>|>[\s\S]*?<\/rest>)[\s\S]*?<duration>([\d.]+)<\/duration>[\s\S]*?<\/note>/gi;
  cleanXml = cleanXml.replace(hiddenRestPattern, (_, duration) => {
    return `<forward><duration>${duration}</duration></forward>`;
  });

  // 3. Remove empty <notations></notations> or empty <ornaments/> which can trigger OSMD errors
  cleanXml = cleanXml.replace(/<notations>\s*<\/notations>/gi, '');
  cleanXml = cleanXml.replace(/<ornaments>\s*<\/ornaments>/gi, '');

  // 4. Fix stray <alter> elements that are not inside <pitch>
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

  // 5. Fix polyphonic measures (ensure notes have explicit voice elements for OSMD)
  const measurePattern = /(<measure[^>]*>)([\s\S]*?)(<\/measure>)/g;
  cleanXml = cleanXml.replace(measurePattern, (measureMatch, measureStart, measureBody, measureEnd) => {
    const hasBackup = /<backup[\s>\/]/.test(measureBody);
    const voiceMatches = Array.from(measureBody.matchAll(/<voice>(\d+)<\/voice>/g)) as RegExpMatchArray[];
    const uniqueVoices = new Set(voiceMatches.map((m: RegExpMatchArray) => parseInt(m[1], 10)));
    const isPolyphonic = hasBackup || uniqueVoices.size > 1;

    if (!isPolyphonic) {
      return measureMatch;
    }

    let fixedBody = measureBody;
    const noteMatches: Array<{ match: string; index: number; attrs: string; content: string }> = [];
    const notePattern = /<note([^>]*)>([\s\S]*?)(<\/note>)/g;
    let match;

    while ((match = notePattern.exec(measureBody)) !== null) {
      noteMatches.push({
        match: match[0],
        index: match.index,
        attrs: match[1],
        content: match[2]
      });
    }

    for (let i = noteMatches.length - 1; i >= 0; i--) {
      const noteMatch = noteMatches[i];
      if (/<voice>/.test(noteMatch.content)) {
        continue;
      }

      const beforeNote = fixedBody.substring(0, noteMatch.index);
      const lastBackupIndex = beforeNote.lastIndexOf('<backup');
      const voicesBefore = Array.from(beforeNote.matchAll(/<voice>(\d+)<\/voice>/g)) as RegExpMatchArray[];

      let voiceNum = 1;
      if (lastBackupIndex !== -1) {
        voiceNum = 2;
      } else if (voicesBefore.length > 0) {
        const lastVoiceMatch = voicesBefore[voicesBefore.length - 1] as RegExpMatchArray;
        voiceNum = parseInt(lastVoiceMatch[1], 10) || 1;
      }

      let newContent = noteMatch.content;
      if (/<duration>/.test(newContent)) {
        newContent = newContent.replace(/(<\/duration>)/, `$1\n      <voice>${voiceNum}</voice>`);
      } else if (/<rest/.test(newContent)) {
        newContent = newContent.replace(/(<rest[^>]*>)/, `$1\n      <voice>${voiceNum}</voice>`);
      } else {
        newContent = `      <voice>${voiceNum}</voice>\n` + newContent;
      }

      const newNote = `<note${noteMatch.attrs}>${newContent}</note>`;
      fixedBody = fixedBody.substring(0, noteMatch.index) + newNote + fixedBody.substring(noteMatch.index + noteMatch.match.length);
    }

    return measureStart + fixedBody + measureEnd;
  });

  return cleanXml;
}

/**
 * Parse metadata from MusicXML document
 */
export function extractMusicXmlMetadata(xml: string): MusicXmlMetadata {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  // Title
  let title: string | undefined;
  const workTitle = doc.querySelector('work > work-title, movement-title');
  if (workTitle?.textContent?.trim()) {
    title = workTitle.textContent.trim();
  } else {
    const creditWords = doc.querySelectorAll('credit > credit-words');
    for (let i = 0; i < creditWords.length; i++) {
      const txt = creditWords[i].textContent?.trim();
      if (txt && txt.length > 1 && !/composer|arranger|page/i.test(txt)) {
        title = txt;
        break;
      }
    }
  }

  // Composer
  let composer: string | undefined;
  const creatorComposer = doc.querySelector('identification > creator[type="composer"], creator');
  if (creatorComposer?.textContent?.trim()) {
    composer = creatorComposer.textContent.trim();
  }

  // Time Signature
  let timeSignature: { beats: number; beatType: number } | undefined;
  const beatsEl = doc.querySelector('attributes > time > beats');
  const beatTypeEl = doc.querySelector('attributes > time > beat-type');
  if (beatsEl && beatTypeEl) {
    const beats = parseInt(beatsEl.textContent || '4', 10);
    const beatType = parseInt(beatTypeEl.textContent || '4', 10);
    if (!isNaN(beats) && !isNaN(beatType)) {
      timeSignature = { beats, beatType };
    }
  }

  // Divisions
  let divisions = 1;
  const divisionsEl = doc.querySelector('attributes > divisions, divisions');
  if (divisionsEl) {
    const d = parseInt(divisionsEl.textContent || '1', 10);
    if (!isNaN(d) && d > 0) {
      divisions = d;
    }
  }

  // Tempo (BPM)
  let tempo: number | undefined;
  const soundTempo = doc.querySelector('sound[tempo]');
  if (soundTempo) {
    const t = parseFloat(soundTempo.getAttribute('tempo') || '');
    if (!isNaN(t) && t > 0) tempo = Math.round(t);
  }
  if (!tempo) {
    const perMinute = doc.querySelector('direction-type > metronome > per-minute');
    if (perMinute) {
      const t = parseFloat(perMinute.textContent || '');
      if (!isNaN(t) && t > 0) tempo = Math.round(t);
    }
  }

  // Total measures and parts
  const parts = doc.querySelectorAll('part');
  const partCount = parts.length || 1;
  let totalMeasures = 0;
  if (parts.length > 0) {
    totalMeasures = parts[0].querySelectorAll('measure').length;
  } else {
    totalMeasures = doc.querySelectorAll('measure').length;
  }

  return {
    title,
    composer,
    timeSignature,
    tempo: tempo || 80,
    divisions,
    totalMeasures,
    partCount,
  };
}
