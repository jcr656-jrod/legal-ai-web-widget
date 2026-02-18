import React, { useState, useRef, useCallback, useEffect } from 'react';

// ============================================================
// LEGAL AI WEB INTAKE WIDGET
// JR Cloud Technologies LLC
// 
// Modified from OmniVoice AI to serve as a web-based voice
// intake widget for law firms. Connects to n8n webhook for
// lead processing into GHL CRM pipeline.
//
// CONFIGURATION: Update these per-client before deployment
// ============================================================

// ===== CLIENT CONFIG (SWAP PER LAW FIRM) =====
const CLIENT_CONFIG = {
  clientId: 'jrcloud-legal-demo',
  firmName: 'JR Cloud Legal AI',
  firmTagline: 'AI-Powered Legal Intake',
  aiAssistantName: 'Sarah',
  primaryColor: '#1B2A4A',
  accentColor: '#C4A35A',

  webhookUrl: 'https://jcr656.app.n8n.cloud/webhook/legal-intake-demo',

  practiceAreas: ['Criminal Defense', 'DUI/DWI', 'Personal Injury', 'Family Law'],

  geminiApiKey: 'AIzaSyCD_I8Ww0EC_NdQhoreXUypCtFPW_t13j0',

  // GHL Direct Booking (no n8n needed)
  ghlApiToken: import.meta.env.VITE_GHL_TOKEN || '',
  ghlLocationId: 'Od0jTeQPHdqsdWqxxTRk',
  ghlCalendarId: 'HSdmkOo8Ysm2eCydR8ng',
  bookingEnabled: true,
  attorneyPhone: '+14482081494',
  attorneyName: 'Attorney',
};

﻿// ============================================
// GHL CALENDAR BOOKING - DIRECT API (NO N8N)
// ============================================

async function getAvailableSlots(date: string): Promise<string[]> {
  const startDate = date + 'T00:00:00-05:00';
  const endDate = date + 'T23:59:59-05:00';
  try {
    const res = await fetch(
      'https://services.leadconnectorhq.com/calendars/' +
      CLIENT_CONFIG.ghlCalendarId + '/free-slots?' +
      'startDate=' + encodeURIComponent(startDate) + '&' +
      'endDate=' + encodeURIComponent(endDate) + '&' +
      'timezone=America/New_York',
      { headers: { 'Authorization': 'Bearer ' + CLIENT_CONFIG.ghlApiToken, 'Version': '2021-04-15', 'Accept': 'application/json' } }
    );
    const data = await res.json();
    const dateKey = Object.keys(data.slots || data)[0];
    const rawSlots = data.slots?.[dateKey] || data[dateKey] || [];
    return rawSlots.map((s: string) => {
      const d = new Date(s);
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' });
    });
  } catch (err) { console.error('Failed to get slots:', err); return []; }
}

async function bookGHLAppointment(params: { name: string; email: string; phone: string; datetime: string; caseType?: string; }): Promise<{ success: boolean; message: string }> {
  try {
    const phoneClean = params.phone.replace(/\D/g, '');
    const phoneFormatted = phoneClean.startsWith('1') ? '+' + phoneClean : '+1' + phoneClean;
    const contactRes = await fetch('https://services.leadconnectorhq.com/contacts/', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + CLIENT_CONFIG.ghlApiToken, 'Version': '2021-07-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId: CLIENT_CONFIG.ghlLocationId, firstName: params.name.split(' ')[0], lastName: params.name.split(' ').slice(1).join(' ') || '', phone: phoneFormatted, email: params.email, tags: ['web-intake', 'ai-booking', params.caseType || 'legal'], source: 'Legal AI Widget' })
    });
    const contact = await contactRes.json();
    const contactId = contact.contact?.id || contact.id;
    if (!contactId) return { success: false, message: 'Could not create contact' };
    const apptRes = await fetch('https://services.leadconnectorhq.com/calendars/events/appointments', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + CLIENT_CONFIG.ghlApiToken, 'Version': '2021-04-15', 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarId: CLIENT_CONFIG.ghlCalendarId, locationId: CLIENT_CONFIG.ghlLocationId, contactId: contactId, startTime: params.datetime, title: 'Legal Consultation - ' + params.name + ' (' + (params.caseType || 'General') + ')', appointmentStatus: 'confirmed', meetingLocationType: 'google_meet', notes: 'Booked via Legal AI Web Widget\nCase Type: ' + (params.caseType || 'General') + '\nSource: web_chat' })
    });
    const appt = await apptRes.json();
    if (appt.id || appt.event?.id) {
      const apptDate = new Date(params.datetime);
      const formatted = apptDate.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
      // Send SMS to client via GHL
      if (contactId) {
        const clientMsg = 'Your legal consultation has been confirmed for ' + formatted + '. You will receive a Google Meet link shortly. Reply STOP to opt out.';
        sendSMSviaGHL(contactId, clientMsg);
      }
      // Notify attorney
      notifyAttorney({ name: params.name, phone: params.phone, caseType: params.caseType || 'General', datetime: params.datetime });
      return { success: true, message: 'Appointment booked for ' + formatted };
    }
    return { success: false, message: 'Booking failed - please try again' };
  } catch (err) { console.error('Booking error:', err); return { success: false, message: 'Could not connect to booking system' }; }
}

async function sendSMSviaGHL(contactId: string, message: string): Promise<void> {
  try {
    await fetch('https://services.leadconnectorhq.com/conversations/messages', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + CLIENT_CONFIG.ghlApiToken,
        'Version': '2021-04-15',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'SMS',
        contactId: contactId,
        message: message,
      }),
    });
  } catch (err) { console.error('SMS send failed:', err); }
}

async function notifyAttorney(params: { name: string; phone: string; caseType: string; datetime: string; meetLink?: string; }): Promise<void> {
  try {
    // Create or find attorney as contact to send SMS
    const msg = 'NEW INTAKE BOOKING\n' +
      'Client: ' + params.name + '\n' +
      'Phone: ' + params.phone + '\n' +
      'Case: ' + (params.caseType || 'General') + '\n' +
      'Time: ' + new Date(params.datetime).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) + '\n' +
      (params.meetLink ? 'Meet: ' + params.meetLink : '') +
      '\nBooked via Legal AI Widget';

    // Use Twilio directly for attorney notification
    const twilioSid = import.meta.env.VITE_TWILIO_SID || '';
    const twilioAuth = import.meta.env.VITE_TWILIO_AUTH || '';
    const fromPhone = import.meta.env.VITE_TWILIO_PHONE || '+14482081494';
    const toPhone = CLIENT_CONFIG.attorneyPhone;
    
    const twilioBody = new URLSearchParams({
      To: toPhone,
      From: fromPhone,
      Body: msg,
    });
    
    await fetch('https://api.twilio.com/2010-04-01/Accounts/' + twilioSid + '/Messages.json', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(twilioSid + ':' + twilioAuth),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: twilioBody.toString(),
    });
  } catch (err) { console.error('Attorney notification failed:', err); }
}




// ===== TYPES =====
interface ProductProfile {
  name: string;
  description: string;
  tone: string;
  instructions: string;
}

interface TranscriptionEntry {
  role: 'user' | 'agent';
  text: string;
  timestamp: number;
}

interface IntakeData {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  caseType?: string;
  urgency?: string;
  jurisdiction?: string;
  caseSummary?: string;
  courtDate?: string;
}

// ===== AUDIO UTILITIES =====
function encode(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
  return btoa(binary);
}

function decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array, ctx: AudioContext, sampleRate: number, channels: number
): Promise<AudioBuffer> {
  const numSamples = data.length / 2;
  const audioBuffer = ctx.createBuffer(channels, numSamples, sampleRate);
  const channelData = audioBuffer.getChannelData(0);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < numSamples; i++) {
    channelData[i] = view.getInt16(i * 2, true) / 32768;
  }
  return audioBuffer;
}

// ===== CONSTANTS =====
const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-12-2025';
const SAMPLE_RATE_IN = 16000;
const SAMPLE_RATE_OUT = 24000;

// ===== URGENCY KEYWORDS =====
const URGENCY_KEYWORDS = {
  emergency: ['arrested', 'jail', 'detained', 'custody', 'court tomorrow', 'emergency', 'restraining order', 'deportation'],
  high: ['court date', 'deadline', 'eviction', 'accident today', 'hospital', 'injured'],
  medium: ['charged', 'citation', 'ticket', 'summons', 'hearing'],
};

function detectUrgency(text: string): string {
  const lower = text.toLowerCase();
  for (const keyword of URGENCY_KEYWORDS.emergency) {
    if (lower.includes(keyword)) return 'emergency';
  }
  for (const keyword of URGENCY_KEYWORDS.high) {
    if (lower.includes(keyword)) return 'high';
  }
  for (const keyword of URGENCY_KEYWORDS.medium) {
    if (lower.includes(keyword)) return 'medium';
  }
  return 'low';
}

// ===== CASE TYPE DETECTION =====
const CASE_TYPE_KEYWORDS: Record<string, string[]> = {
  'Criminal Defense': ['arrested', 'criminal', 'felony', 'misdemeanor', 'charges', 'indicted', 'assault', 'theft', 'robbery', 'murder', 'manslaughter', 'drug', 'weapons'],
  'DUI/DWI': ['dui', 'dwi', 'drunk driving', 'breathalyzer', 'bac', 'blood alcohol', 'impaired', 'field sobriety', 'license suspended'],
  'Personal Injury': ['accident', 'injured', 'injury', 'hurt', 'car crash', 'slip and fall', 'medical malpractice', 'negligence', 'pain', 'suffering', 'hospital'],
  'Family Law': ['divorce', 'custody', 'child support', 'alimony', 'visitation', 'separation', 'domestic', 'restraining order', 'adoption'],
  'Immigration': ['immigration', 'visa', 'deportation', 'green card', 'asylum', 'citizenship', 'undocumented', 'ice'],
};

function detectCaseType(text: string): string {
  const lower = text.toLowerCase();
  let bestMatch = 'Unknown';
  let bestScore = 0;
  for (const [caseType, keywords] of Object.entries(CASE_TYPE_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (lower.includes(keyword)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = caseType;
    }
  }
  return bestMatch;
}

// ===== LEGAL INTAKE SYSTEM PROMPT =====
function buildSystemPrompt(config: typeof CLIENT_CONFIG, profile: ProductProfile): string {
  return `You are ${config.aiAssistantName}, the virtual intake specialist for ${config.firmName}.

## YOUR ROLE
You are the first point of contact for potential clients reaching out via the website. Your job is to:
1. Warmly greet the visitor and make them feel heard
2. Gather essential information about their legal situation
3. Determine if their case matches the firm's practice areas: ${config.practiceAreas.join(', ')}
4. Assess urgency and priority level
5. Collect their contact information for attorney follow-up

## KNOWLEDGE BASE
${profile.description}

## INTAKE FLOW

### Step 1: Greeting
Greet warmly: "Hi, I'm ${config.aiAssistantName} from ${config.firmName}. I'm here to help connect you with the right attorney. How can I help you today?"

### Step 2: Listen & Identify
Let them explain their situation. Identify the case type from their description.

### Step 3: Gather Information
Naturally collect:
- Full name
- Phone number
- Email address (optional)
- City and state where the incident occurred
- Brief description of what happened
- When it happened
- Any upcoming court dates or deadlines
- Whether they've spoken to another attorney

### Step 4: Urgency Assessment
Flag as HIGH PRIORITY if: arrested, detained, court date within 7 days, emergency situation.

### Step 5: Next Steps
If qualified: "Based on what you've told me, this is something ${config.firmName} can help with. Let me make sure an attorney reaches out to you right away."
If not qualified: Be empathetic, explain the firm doesn't handle that type of case, suggest contacting the state bar association.

## RULES
1. NEVER provide legal advice or opinions on case merit
2. NEVER discuss fees, retainer amounts, or payment
3. NEVER guarantee results or make promises
4. ALWAYS disclose you are an AI assistant when asked
5. ALWAYS be empathetic - visitors are often stressed
6. If someone is in immediate danger, tell them to call 911
7. Keep conversations focused and under 5 minutes

## COMPLIANCE DISCLAIMER
Before wrapping up, say: "I want you to know that I'm an AI intake specialist, not an attorney. Our conversation is for intake purposes only and doesn't create an attorney-client relationship. Everything you've shared will be kept confidential and forwarded to an attorney for review."

## TONE
${profile.tone}

## ADDITIONAL INSTRUCTIONS
${profile.instructions}`;
}

// ===== PULSE VISUALIZER COMPONENT =====
const PulseVisualizer: React.FC<{ isActive: boolean; primaryColor?: string; accentColor?: string }> = ({ 
  isActive, 
  primaryColor = CLIENT_CONFIG.primaryColor, 
  accentColor = CLIENT_CONFIG.accentColor 
}) => {
  return (
    <div className="relative w-40 h-40 flex items-center justify-center">
      {/* Outer rings */}
      <div
        className={`absolute w-40 h-40 rounded-full border-2 transition-all duration-1000 ${
          isActive ? 'animate-ping opacity-20' : 'opacity-10'
        }`}
        style={{ borderColor: accentColor }}
      />
      <div
        className={`absolute w-32 h-32 rounded-full border transition-all duration-700 ${
          isActive ? 'animate-pulse opacity-30' : 'opacity-10'
        }`}
        style={{ borderColor: primaryColor }}
      />
      {/* Center orb */}
      <div
        className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 ${
          isActive ? 'shadow-lg scale-110' : 'scale-100'
        }`}
        style={{
          background: isActive 
            ? `radial-gradient(circle, ${accentColor}, ${primaryColor})` 
            : `radial-gradient(circle, #374151, #1f2937)`,
          boxShadow: isActive ? `0 0 40px ${accentColor}44` : 'none',
        }}
      >
        {/* Mic icon */}
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      </div>
    </div>
  );
};

// ===== MAIN APP COMPONENT =====
const App: React.FC = () => {
  const isWidgetView = new URLSearchParams(window.location.search).get('view') === 'widget';

  const [profile, setProfile] = useState<ProductProfile>({
    name: CLIENT_CONFIG.firmName,
    description: '', // Will be loaded from knowledge base
    tone: 'professional',
    instructions: `Be helpful, empathetic, and focused on gathering intake information for ${CLIENT_CONFIG.firmName}. Reference criminal law knowledge when classifying cases. Never provide legal advice.`
  });

  const [isSessionActive, setIsSessionActive] = useState(false);
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [leadSent, setLeadSent] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(true);

  // Audio refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  const fullConversationRef = useRef('');

  // ===== SEND LEAD TO N8N WEBHOOK =====
  const sendLeadToWebhook = useCallback(async (conversationText: string) => {
    if (leadSent) return; // Don't send twice

    const urgency = detectUrgency(conversationText);
    const caseType = detectCaseType(conversationText);

    const payload = {
      // Source identification
      source: 'web_chat',
      client_id: CLIENT_CONFIG.clientId,
      firm_name: CLIENT_CONFIG.firmName,
      
      // Call data
      transcript: conversationText,
      call_duration_seconds: 0, // web chat doesn't have duration
      recording_url: null,
      timestamp: new Date().toISOString(),
      
      // AI-extracted data (from conversation analysis)
      tool_calls: [{
        function_name: 'create_lead',
        parameters: {
          first_name: extractField(conversationText, 'name') || 'Web Visitor',
          last_name: '',
          phone: extractField(conversationText, 'phone') || '',
          email: extractField(conversationText, 'email') || '',
          case_type: caseType,
          urgency: urgency,
          jurisdiction_state: extractField(conversationText, 'state') || '',
          jurisdiction_city: extractField(conversationText, 'city') || '',
          case_summary: summarizeConversation(conversationText),
          court_date: extractField(conversationText, 'court_date') || '',
          source: 'web_chat'
        }
      }],
      
      // Full transcription entries for review
      transcription_entries: transcriptions.map(t => ({
        role: t.role,
        text: t.text,
        timestamp: new Date(t.timestamp).toISOString()
      }))
    };

    try {
      const response = await fetch(CLIENT_CONFIG.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-source': 'legal-ai-web-widget',
          'x-client-id': CLIENT_CONFIG.clientId,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setLeadSent(true);
        console.log('[Legal AI] Lead sent to n8n successfully');
      } else {
        console.error('[Legal AI] Webhook failed:', response.status);
      }
    } catch (err) {
      console.error('[Legal AI] Failed to send lead:', err);
    }
  }, [leadSent, transcriptions]);

  // ===== FIELD EXTRACTION FROM CONVERSATION =====
  function extractField(text: string, field: string): string {
    const lower = text.toLowerCase();
    
    switch (field) {
      case 'phone': {
        const phoneMatch = text.match(/(\+?1?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/);
        return phoneMatch ? phoneMatch[1] : '';
      }
      case 'email': {
        const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
        return emailMatch ? emailMatch[0] : '';
      }
      case 'name': {
        // Look for "my name is X" or "I'm X" patterns
        const nameMatch = text.match(/(?:my name is|i'm|i am|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
        return nameMatch ? nameMatch[1] : '';
      }
      case 'state': {
        const states = ['alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa','kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan','minnesota','mississippi','missouri','montana','nebraska','nevada','new hampshire','new jersey','new mexico','new york','north carolina','north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island','south carolina','south dakota','tennessee','texas','utah','vermont','virginia','washington','west virginia','wisconsin','wyoming'];
        for (const state of states) {
          if (lower.includes(state)) return state.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
        }
        // Check abbreviations
        const stateAbbrMatch = text.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/);
        return stateAbbrMatch ? stateAbbrMatch[1] : '';
      }
      case 'city': {
        const cityMatch = text.match(/(?:in|from|near|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
        return cityMatch ? cityMatch[1] : '';
      }
      case 'court_date': {
        const dateMatch = text.match(/(?:court|hearing|trial)[\s\w]*(?:on|is|date)\s+([\w\s,]+\d{1,4})/i);
        return dateMatch ? dateMatch[1].trim() : '';
      }
      default:
        return '';
    }
  }

  function summarizeConversation(text: string): string {
    // Take the user's messages and create a brief summary
    const userMessages = transcriptions
      .filter(t => t.role === 'user')
      .map(t => t.text)
      .join(' ');
    
    // Truncate to 500 chars
    return userMessages.length > 500 ? userMessages.substring(0, 497) + '...' : userMessages;
  }

  // ===== STOP SESSION =====
  const stopSession = useCallback(() => {
    // Send lead data to webhook when session ends
    if (fullConversationRef.current.trim().length > 20) {
      sendLeadToWebhook(fullConversationRef.current);
    }

    if (sessionRef.current) sessionRef.current.close();
    if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
    if (inputAudioContextRef.current) inputAudioContextRef.current.close();
    if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    setIsSessionActive(false);
  }, [sendLeadToWebhook]);

  // ===== START SESSION =====
  const startSession = async () => {
    try {
      setError(null);
      setLeadSent(false);
      setShowDisclaimer(false);
      fullConversationRef.current = '';

      // Dynamic import of Gemini SDK
      const { GoogleGenAI, Modality } = await import('@google/genai');
      
      const ai = new GoogleGenAI({ apiKey: CLIENT_CONFIG.geminiApiKey });
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE_IN });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE_OUT });
      nextStartTimeRef.current = 0;
      sourcesRef.current.clear();
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

      const systemInstruction = buildSystemPrompt(CLIENT_CONFIG, profile);

      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsSessionActive(true);
            const source = inputAudioContextRef.current!.createMediaStreamSource(micStreamRef.current!);
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              const pcmBlob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: async (message: any) => {
            // Handle transcriptions
            if (message.serverContent?.outputTranscription) {
              currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
            } else if (message.serverContent?.inputTranscription) {
              currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
            }

            // Handle turn completion
            if (message.serverContent?.turnComplete) {
              const uText = currentInputTranscriptionRef.current.trim();
              const aText = currentOutputTranscriptionRef.current.trim();
              
              if (uText) {
                fullConversationRef.current += `User: ${uText}\n`;
                setTranscriptions(prev => [...prev, { role: 'user', text: uText, timestamp: Date.now() }]);
              }
              if (aText) {
                fullConversationRef.current += `Agent: ${aText}\n`;
                setTranscriptions(prev => [...prev, { role: 'agent', text: aText, timestamp: Date.now() }]);
              }
              
              currentInputTranscriptionRef.current = '';
              currentOutputTranscriptionRef.current = '';
            }

            // Handle audio playback
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, SAMPLE_RATE_OUT, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.addEventListener('ended', () => sourcesRef.current.delete(source));
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            // Handle interruption
            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: () => {
            setError('Connection error. Please try again.');
            stopSession();
          },
          onclose: () => setIsSessionActive(false)
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error('[Legal AI] Session error:', err);
      setError('Failed to connect. Please check your microphone permissions and try again.');
      stopSession();
    }
  };

  // ===== WIDGET VIEW (Embeddable) =====
  if (isWidgetView) {
    return (
      <div style={{
        height: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: `linear-gradient(135deg, ${CLIENT_CONFIG.primaryColor} 0%, #0f1724 100%)`,
        padding: '24px',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Georgia', serif",
        overflow: 'hidden',
        borderRadius: '20px',
      }}>
        {/* Firm branding */}
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '3px', color: CLIENT_CONFIG.accentColor, textTransform: 'uppercase', fontFamily: 'monospace' }}>
            {CLIENT_CONFIG.firmTagline}
          </div>
        </div>

        {/* Visualizer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
          <PulseVisualizer isActive={isSessionActive} />
          <div style={{ marginTop: '24px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>
              {CLIENT_CONFIG.firmName}
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '14px', fontStyle: 'italic' }}>
              {isSessionActive ? 'Listening...' : leadSent ? 'Thank you! An attorney will contact you shortly.' : 'Click below to speak with our intake specialist'}
            </p>
          </div>
        </div>

        {/* Transcription area */}
        {transcriptions.length > 0 && (
          <div style={{
            width: '100%',
            maxHeight: '200px',
            overflowY: 'auto',
            marginBottom: '16px',
            padding: '12px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
            {transcriptions.slice(-4).map((t, idx) => (
              <div key={idx} style={{
                padding: '6px 12px',
                margin: '4px 0',
                borderRadius: '8px',
                fontSize: '13px',
                background: t.role === 'user' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                color: t.role === 'user' ? '#a5b4fc' : '#e2e8f0',
                textAlign: t.role === 'user' ? 'right' : 'left',
              }}>
                <div style={{ fontSize: '10px', opacity: 0.5, marginBottom: '2px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                  {t.role === 'user' ? 'You' : CLIENT_CONFIG.aiAssistantName}
                </div>
                {t.text}
              </div>
            ))}
          </div>
        )}

        {/* Disclaimer */}
        {showDisclaimer && !isSessionActive && (
          <div style={{
            width: '100%',
            padding: '12px 16px',
            background: 'rgba(196,163,90,0.1)',
            border: '1px solid rgba(196,163,90,0.2)',
            borderRadius: '10px',
            marginBottom: '12px',
            fontSize: '11px',
            color: '#d4bc6a',
            lineHeight: '1.5',
            textAlign: 'center',
          }}>
            This AI intake specialist is not an attorney. No attorney-client relationship is formed. Your information will be forwarded to an attorney for review.
          </div>
        )}

        {/* Action buttons */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '8px' }}>
          {error && (
            <p style={{ color: '#f87171', fontSize: '12px', textAlign: 'center' }}>{error}</p>
          )}
          
          {leadSent ? (
            <div style={{
              width: '100%',
              padding: '16px',
              borderRadius: '14px',
              background: 'rgba(34,197,94,0.15)',
              border: '1px solid rgba(34,197,94,0.3)',
              color: '#86efac',
              textAlign: 'center',
              fontWeight: 'bold',
              fontSize: '14px',
            }}>
              âœ“ Your information has been received. An attorney will reach out shortly.
            </div>
          ) : (
            <button
              onClick={isSessionActive ? stopSession : startSession}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '14px',
                border: isSessionActive ? '1px solid rgba(239,68,68,0.3)' : 'none',
                background: isSessionActive 
                  ? 'rgba(239,68,68,0.15)' 
                  : `linear-gradient(135deg, ${CLIENT_CONFIG.accentColor}, ${CLIENT_CONFIG.primaryColor})`,
                color: isSessionActive ? '#fca5a5' : '#fff',
                fontWeight: 'bold',
                fontSize: '15px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                transition: 'all 0.3s',
                boxShadow: isSessionActive ? 'none' : `0 8px 24px ${CLIENT_CONFIG.primaryColor}66`,
                fontFamily: "'Georgia', serif",
              }}
            >
              {isSessionActive ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  End Conversation
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  Speak with Intake Specialist
                </>
              )}
            </button>
          )}
        </div>

        {/* Footer */}
        <div style={{ 
          marginTop: '8px', 
          fontSize: '10px', 
          color: 'rgba(255,255,255,0.2)', 
          textAlign: 'center' 
        }}>
          Powered by JR Cloud Technologies
        </div>
      </div>
    );
  }

  // ===== FULL PAGE VIEW (Admin/Demo) =====
  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 max-w-6xl mx-auto" style={{ fontFamily: "'Georgia', serif" }}>
      <header className="w-full flex justify-between items-center mb-12">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: CLIENT_CONFIG.primaryColor }}>
            {CLIENT_CONFIG.firmName}
          </h1>
          <p className="text-slate-400 text-sm">{CLIENT_CONFIG.firmTagline} &mdash; Web Intake Widget</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isSessionActive ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`} />
          <span className="text-xs uppercase tracking-wider font-semibold text-slate-300">
            {isSessionActive ? 'Agent Live' : 'Offline'}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full flex-1">
        {/* Config panel */}
        <aside className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl">
            <h2 className="text-xl font-semibold mb-4 text-white flex items-center gap-2">
              <span style={{ color: CLIENT_CONFIG.accentColor }}>âš™</span> Widget Configuration
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Firm Name</label>
                <input 
                  type="text" 
                  value={profile.name} 
                  onChange={(e) => setProfile(p => ({...p, name: e.target.value}))} 
                  disabled={isSessionActive}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Knowledge Base</label>
                <textarea 
                  value={profile.description} 
                  onChange={(e) => setProfile(p => ({...p, description: e.target.value}))} 
                  disabled={isSessionActive} 
                  rows={4}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">n8n Webhook URL</label>
                <input 
                  type="text" 
                  value={CLIENT_CONFIG.webhookUrl} 
                  disabled 
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-500 text-sm outline-none opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Practice Areas</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {CLIENT_CONFIG.practiceAreas.map(area => (
                    <span key={area} className="px-3 py-1 bg-slate-700 text-slate-300 rounded-full text-xs">
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Embed code */}
          <div className="bg-slate-800/30 border border-slate-700 p-6 rounded-2xl">
            <h3 className="text-sm font-bold text-slate-400 uppercase mb-3">Embed Code</h3>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs text-indigo-300 overflow-x-auto">
              {`<iframe src="${window.location.href.split('?')[0]}?view=widget" width="400" height="650" style="border:none;border-radius:20px;" allow="microphone"></iframe>`}
            </div>
          </div>
        </aside>

        {/* Main area */}
        <main className="lg:col-span-8 flex flex-col gap-8 h-full">
          {/* Voice area */}
          <div className="flex-1 bg-slate-800/50 border border-slate-700 rounded-3xl p-8 flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden"
            style={{ borderTopColor: CLIENT_CONFIG.accentColor, borderTopWidth: '3px' }}>
            <PulseVisualizer isActive={isSessionActive} />
            <div className="mt-12 flex flex-col items-center">
              {error && (
                <div className="mb-6 p-3 bg-red-500/10 border border-red-500/50 text-red-400 rounded-lg text-sm">{error}</div>
              )}
              {!isSessionActive ? (
                <button 
                  onClick={startSession}
                  className="px-10 py-4 text-white font-bold rounded-full transition-all hover:scale-105 active:scale-95 flex items-center gap-3"
                  style={{ 
                    background: `linear-gradient(135deg, ${CLIENT_CONFIG.accentColor}, ${CLIENT_CONFIG.primaryColor})`,
                    boxShadow: `0 8px 24px ${CLIENT_CONFIG.primaryColor}44`
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  Start Legal Intake
                </button>
              ) : (
                <button 
                  onClick={stopSession}
                  className="px-10 py-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-full transition-all hover:scale-105 active:scale-95 flex items-center gap-3"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  End Session
                </button>
              )}
              {leadSent && (
                <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg text-sm">
                  âœ“ Lead sent to CRM pipeline successfully
                </div>
              )}
            </div>
          </div>

          {/* Transcription */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl flex flex-col h-64 overflow-hidden">
            <div className="px-6 py-3 border-b border-slate-800 flex justify-between items-center bg-slate-800/30 text-xs font-bold text-slate-500 uppercase tracking-widest">
              <span>Live Transcription</span>
              <button onClick={() => setTranscriptions([])} className="text-indigo-400 hover:text-indigo-300">Clear</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {transcriptions.length === 0 && !isSessionActive && (
                <div className="text-center text-slate-600 italic text-sm py-8">
                  Start a session to begin intake...
                </div>
              )}
              {transcriptions.map((t, idx) => (
                <div key={idx} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                    t.role === 'user' 
                      ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-100' 
                      : 'bg-slate-800 border border-slate-700 text-slate-200'
                  }`}>
                    <span className="text-[10px] block opacity-50 mb-1 font-bold uppercase">
                      {t.role === 'user' ? 'Caller' : CLIENT_CONFIG.aiAssistantName}
                    </span>
                    {t.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      <footer className="w-full py-8 text-slate-500 text-xs text-center border-t border-slate-800 mt-8">
        Legal AI Intake Widget â€¢ JR Cloud Technologies LLC â€¢ Powered by Gemini 2.5 Native Audio
      </footer>
    </div>
  );
};

export default App;

