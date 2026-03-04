"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Send, Shield, ShieldAlert, Terminal, Wifi, WifiOff, Paperclip, X, Flame, MapPin, Mic, Square, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Message {
    id: string;
    text: string;
    sender: string;
    timestamp: string;
    media_url?: string | null;
    metadata?: any;
}

export default function ChatScreen() {
    const router = useRouter();
    const [senderId, setSenderId] = useState<string | null>(null);
    const [targetId, setTargetId] = useState<string>("BİLİNMEYEN HEDEF");
    const [messages, setMessages] = useState<Message[]>([
        { id: "1", text: "GÜVENLİ BAĞLANTI KURULDU.", sender: "system", timestamp: "00:00" },
        { id: "2", text: "Talimatlar bekleniyor.", sender: "system", timestamp: "00:01" }
    ]);
    const [input, setInput] = useState("");
    const [connected, setConnected] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [quotedMessage, setQuotedMessage] = useState<Message | null>(null);
    const [isTargetTyping, setIsTargetTyping] = useState(false);
    const [secretMessage, setSecretMessage] = useState("");
    const [revealedSteganography, setRevealedSteganography] = useState<Record<string, boolean>>({});

    // Advanced Tools State
    const [isBossScreenActive, setIsBossScreenActive] = useState(false);
    const [decryptedImages, setDecryptedImages] = useState<Record<string, boolean>>({});
    const [burnModeActive, setBurnModeActive] = useState(false);
    const [burningMessages, setBurningMessages] = useState<string[]>([]);
    const [destroyedMessages, setDestroyedMessages] = useState<string[]>([]);
    const [isRecording, setIsRecording] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    // Timer refs for long press steganography
    const decryptionTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const id = localStorage.getItem("operative_id");
        if (!id) {
            router.push("/");
            return;
        }
        setSenderId(id);

        // 1. Fetch initial messages and the other operative's codename
        const fetchInitialData = async () => {
            // Get Target Name
            const { data: opData } = await supabase
                .from('operatives')
                .select('codename')
                .neq('codename', id)
                .limit(1)
                .single();

            if (opData) {
                setTargetId(opData.codename);
            }

            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .order('created_at', { ascending: true });

            if (!error && data) {
                const formatted = data.map(m => ({
                    ...m,
                    sender: m.sender // Use raw sender from DB ("agent_alpha" or "agent_beta")
                })) as Message[];

                if (formatted.length > 0) {
                    setMessages(prev => {
                        // Keep our first 2 system messages
                        const initialSys = prev.slice(0, 2);
                        // Make sure we don't duplicate existing messages (just in case)
                        const existingIds = new Set(initialSys.map(m => m.id));
                        const newMsgs = formatted.filter(m => !existingIds.has(m.id));
                        return [...initialSys, ...newMsgs];
                    });
                }
            }
        };

        fetchInitialData();

        // Check for expired burn messages every 5 seconds
        const burnInterval = setInterval(() => {
            setMessages(prev => [...prev]); // Force re-render to evaluate time
        }, 5000);

        // 2. Subscribe to Realtime inserts
        const channel = supabase
            .channel('schema-db-changes')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                },
                (payload) => {
                    const newMsg = payload.new as Message;
                    if (newMsg.sender !== id) {
                        // Mark it as read
                        const markAsRead = async () => {
                            const newMeta = { ...(newMsg.metadata || {}), read: true };
                            await supabase
                                .from('messages')
                                .update({ metadata: newMeta })
                                .eq('id', newMsg.id);
                        };
                        markAsRead();
                    }

                    setMessages((prev) => {
                        if (newMsg.sender === id) return prev;
                        // Avoid adding duplicates if it got updated quickly
                        if (prev.find(m => m.id === newMsg.id)) return prev;

                        // We set read locally so the UI updates
                        const displayMsg = { ...newMsg };
                        if (newMsg.sender !== id) {
                            displayMsg.metadata = { ...(displayMsg.metadata || {}), read: true };
                        }

                        return [...prev, displayMsg];
                    });
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'messages',
                },
                (payload) => {
                    const updatedMsg = payload.new as Message;
                    setMessages((prev) =>
                        prev.map(msg => msg.id === updatedMsg.id ? updatedMsg : msg)
                    );
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    setConnected(true);
                } else {
                    setConnected(false);
                }
            });

        // 3. Presence for Typing Indicators
        const typingChannel = supabase.channel('typing_status', {
            config: {
                presence: { key: id },
            },
        });

        typingChannel
            .on('presence', { event: 'sync' }, () => {
                const state = typingChannel.presenceState();
                let someoneIsTyping = false;
                for (const key in state) {
                    if (key !== id) {
                        // Check if the other person's state has typing = true
                        const theirState = state[key][0] as unknown as { typing: boolean };
                        if (theirState?.typing) {
                            someoneIsTyping = true;
                            break;
                        }
                    }
                }
                setIsTargetTyping(someoneIsTyping);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await typingChannel.track({ typing: false });
                }
            });

        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(typingChannel);
            clearInterval(burnInterval);
        };
    }, []);

    // Presence Tracking: updating typing status
    useEffect(() => {
        if (!senderId) return;
        const typingChannel = supabase.channel('typing_status');

        // Let's debounce the "stop typing" slightly
        const updateTypingStatus = async () => {
            if (typingChannel.state === 'joined') {
                await typingChannel.track({ typing: input.length > 0 });
            }
        };
        updateTypingStatus();

    }, [input, senderId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

        // When messages change, check if there are any unread messages from the other person
        // and mark them as read in the DB.
        const markUnreadAsRead = async () => {
            if (!senderId) return;
            const unreadIds = messages
                .filter(m => m.sender !== senderId && m.sender !== "system" && !m.metadata?.read)
                .map(m => m.id);

            if (unreadIds.length > 0) {
                // Optimistically update UI
                setMessages(prev => prev.map(m => {
                    if (unreadIds.includes(m.id)) {
                        return { ...m, metadata: { ...(m.metadata || {}), read: true } };
                    }
                    return m;
                }));

                // Batch update in Supabase
                // Note: supabase-js doesn't have a great bulk update yet without RPC, 
                // so we do it in a loop for the few unreads there might be.
                for (const unreadId of unreadIds) {
                    const msg = messages.find(m => m.id === unreadId);
                    if (msg) {
                        const newMeta = { ...(msg.metadata || {}), read: true };
                        await supabase
                            .from('messages')
                            .update({ metadata: newMeta })
                            .eq('id', unreadId);
                    }
                }
            }
        };

        markUnreadAsRead();

    }, [messages, selectedFile, senderId]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    // Boss Key Event Listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setIsBossScreenActive(prev => !prev);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    const toggleDecryption = (msgId: string) => {
        setDecryptedImages(prev => ({
            ...prev,
            [msgId]: !prev[msgId]
        }));
    };

    const revealSteganography = (msgId: string) => {
        setRevealedSteganography(prev => ({
            ...prev,
            [msgId]: true
        }));
    };

    const handlePointerDown = (msgId: string, hasHiddenText: boolean) => {
        if (!hasHiddenText) return;

        decryptionTimerRef.current = setTimeout(() => {
            revealSteganography(msgId);
        }, 3000);
    };

    const handlePointerUpOrLeave = () => {
        if (decryptionTimerRef.current) {
            clearTimeout(decryptionTimerRef.current);
            decryptionTimerRef.current = null;
        }
    };

    const triggerBurn = (msgId: string) => {
        if (destroyedMessages.includes(msgId)) return;
        setBurningMessages(prev => [...prev, msgId]);
        setTimeout(() => {
            setDestroyedMessages(prev => [...prev, msgId]);
        }, 3000); // 3 seconds to burn
    };

    const sendLocation = () => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(async (position) => {
                const lat = position.coords.latitude.toFixed(6);
                const lng = position.coords.longitude.toFixed(6);

                const timestamp = new Date().toISOString();
                const newMsg = {
                    text: `HEDEF KOORDİNATLAR: [${lat}, ${lng}]`,
                    sender: senderId || "agent_alpha",
                    timestamp,
                    metadata: { type: 'radar', lat, lng }
                };

                setMessages(prev => [...prev, { id: Date.now().toString(), ...newMsg } as Message]);
                await supabase.from('messages').insert([newMsg]);
            }, (error) => {
                console.error("Location access denied", error);
                alert("Location access denied by operative.");
            });
        }
    };

    const uploadFile = async (file: File) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const filename = `${uniqueSuffix}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "")}`;

        const { data, error } = await supabase.storage
            .from('secret_media')
            .upload(filename, file);

        if (error) throw error;

        const { data: publicUrlData } = supabase.storage
            .from('secret_media')
            .getPublicUrl(filename);

        return publicUrlData.publicUrl;
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorderRef.current.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });

                setIsUploading(true);
                try {
                    const mediaUrl = await uploadFile(audioFile);
                    const timestamp = new Date().toISOString();

                    const newMsg = {
                        text: "SES_İZİ_ANALİZİ.DAT",
                        sender: senderId || "agent_alpha",
                        timestamp,
                        metadata: { type: 'voice', media_url: mediaUrl, ...(burnModeActive ? { burn: true } : {}) }
                    };

                    setMessages(prev => [...prev, { id: Date.now().toString(), ...newMsg } as Message]);
                    await supabase.from('messages').insert([newMsg]);
                } catch (error) {
                    console.error("Audio upload failed", error);
                } finally {
                    setIsUploading(false);
                }

                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Error accessing microphone", err);
            alert("Microphone access denied.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const playVoicePrint = (url: string) => {
        const audio = new Audio(url);
        audio.play().catch(e => console.error("Playback failed", e));
    };

    const sendMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!input.trim() && !selectedFile) return;
        if (isUploading) return;

        setIsUploading(true);

        try {
            let mediaUrl = null;
            if (selectedFile) {
                mediaUrl = await uploadFile(selectedFile);
            }

            const timestamp = new Date().toISOString();

            const newMsg = {
                text: input,
                sender: senderId || "agent_alpha",
                timestamp,
                media_url: mediaUrl,
                metadata: {
                    ...(burnModeActive ? { burn: true } : {}),
                    ...(secretMessage ? { hidden_text: secretMessage } : {}),
                    ...(quotedMessage ? {
                        replyTo: {
                            id: quotedMessage.id,
                            text: quotedMessage.text,
                            sender: quotedMessage.sender,
                            type: quotedMessage.metadata?.type || 'text'
                        }
                    } : {})
                }
            };

            // Optimistic Update
            setMessages(prev => [...prev, { id: Date.now().toString(), ...newMsg } as Message]);

            // Save to Supabase DB
            await supabase.from('messages').insert([newMsg]);

            setInput("");
            setSelectedFile(null);
            setSecretMessage("");
            setQuotedMessage(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
        } catch (error) {
            console.error("Failed to send message", error);
        } finally {
            setIsUploading(false);
        }
    };

    if (isBossScreenActive) {
        return (
            <div className="boss-screen" onClick={() => setIsBossScreenActive(false)}>
                <div className="boss-screen-header">Şirket Paneli</div>
                <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '5px', width: '80%', background: '#f9f9f9' }}>
                    <h3>3. Çeyrek Kazanç Raporu</h3>
                    <p>Finansal veriler yükleniyor...</p>
                    <div style={{ marginTop: '20px', height: '10px', width: '100%', background: '#ddd', borderRadius: '5px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: '45%', background: '#0056b3' }}></div>
                    </div>
                </div>
                <p style={{ marginTop: '20px', fontSize: '12px', color: '#999' }}>Çalışmaya dönmek için herhangi bir yere tıklayın.</p>
            </div>
        );
    }

    if (!senderId) return null; // Loading state until identity confirmed

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg-color)' }}>

            {/* Header */}
            <header className="glass-panel" style={{
                padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderBottom: '1px solid var(--panel-border)', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                borderRadius: 0, zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Shield className="text-neon-green" size={24} />
                    <div>
                        <h2 className="mono-text" style={{ fontSize: '1rem', margin: 0, color: 'var(--text-main)', textShadow: 'var(--glow-green)', textTransform: 'uppercase' }}>
                            {targetId} İLE GÖRÜŞME
                        </h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: connected ? 'var(--neon-green)' : 'var(--alert-red)' }}>
                            {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
                            <span className="mono-text">{connected ? 'ŞİFRELİ BAĞLANTI AKTİF' : 'YENİDEN BAĞLANILIYOR...'}</span>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <button
                        onClick={() => setIsBossScreenActive(true)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                        title="Panik Butonu (Esc)"
                    >
                        <ShieldAlert className="text-alert-red" size={20} style={{ filter: 'drop-shadow(0 0 5px rgba(255,0,60,0.5))' }} />
                    </button>
                    <Terminal className="text-neon-green" size={20} style={{ opacity: 0.7 }} />
                </div>
            </header>

            {/* Chat Area */}
            <main style={{
                flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem',
                backgroundImage: 'radial-gradient(circle at center, rgba(0,255,65,0.02) 0%, transparent 100%)'
            }}>
                {messages.map((msg) => {
                    const isMe = msg.sender === senderId;
                    const isSystem = msg.sender === "system";
                    const isDestroyed = destroyedMessages.includes(msg.id);
                    const isBurning = burningMessages.includes(msg.id);

                    // Check if message is older than 1 minute and has burn protocol active
                    let isExpired = false;
                    if (msg.metadata?.burn && msg.timestamp) {
                        const msgTime = new Date(msg.timestamp).getTime();
                        const now = new Date().getTime();

                        // If we can't parse the date (e.g. it's the old '12:00 PM' format), default to not expired
                        // but since we updated it to use ISO strings, it should work for all new sending flows.
                        // We give a 60-second window.
                        if (!isNaN(msgTime) && (now - msgTime > 60000)) {
                            isExpired = true;
                        }
                    }

                    if ((isDestroyed && msg.metadata?.burn) || isExpired) return null;

                    // Format timestamp for display safely
                    let displayTime = msg.timestamp;
                    try {
                        const dateObj = new Date(msg.timestamp);
                        if (!isNaN(dateObj.getTime())) {
                            displayTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        }
                    } catch (e) { }

                    return (
                        <div key={msg.id} className={isBurning ? "burning-message" : ""} style={{
                            alignSelf: isMe ? 'flex-end' : 'flex-start',
                            maxWidth: '80%',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                        }}>
                            <div className="mono-text" style={{
                                fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: isMe ? 'right' : 'left', padding: '0 4px',
                                display: 'flex', alignItems: 'center', justifyContent: isMe ? 'flex-end' : 'flex-start', gap: '4px'
                            }}>
                                {displayTime}
                                {msg.metadata?.burn && <Flame size={12} className="text-alert-red" />}
                                {isMe && !isSystem && (
                                    <span style={{ marginLeft: '4px', display: 'flex', alignItems: 'center' }}>
                                        {msg.metadata?.read ? (
                                            <Eye size={12} className="text-neon-green" style={{ filter: 'drop-shadow(0 0 2px rgba(0,255,65,0.8))' }} />
                                        ) : (
                                            <EyeOff size={12} style={{ opacity: 0.5 }} />
                                        )}
                                    </span>
                                )}
                            </div>
                            <div className="glass-panel" onClick={() => msg.metadata?.burn && triggerBurn(msg.id)} style={{
                                padding: msg.metadata?.type === 'radar' ? '0' : '0.75rem 1rem',
                                borderRadius: '12px',
                                borderBottomRightRadius: isMe ? '2px' : '12px',
                                borderBottomLeftRadius: isMe ? '12px' : '2px',
                                border: `1px solid ${isMe ? 'var(--panel-border)' : 'rgba(0, 240, 255, 0.2)'}`,
                                boxShadow: isMe ? 'inset 0 0 10px rgba(0,255,65,0.05)' : 'inset 0 0 10px rgba(0, 240, 255, 0.05)',
                                color: isMe ? 'var(--neon-green)' : 'var(--neon-blue)',
                                fontFamily: isMe ? 'var(--font-sans)' : 'var(--font-mono)',
                                textShadow: isMe ? 'none' : '0 0 8px rgba(0, 240, 255, 0.3)',
                                fontSize: '0.95rem',
                                lineHeight: 1.4,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                wordBreak: 'break-word',
                                cursor: msg.metadata?.burn ? 'pointer' : 'default',
                                overflow: 'hidden'
                            }}>
                                {/* Quoted Message Render */}
                                {msg.metadata?.replyTo && (
                                    <div style={{
                                        background: 'rgba(0,0,0,0.3)',
                                        borderLeft: `4px solid ${isMe ? 'var(--neon-green)' : 'var(--neon-blue)'}`,
                                        padding: '0.5rem',
                                        borderRadius: '4px',
                                        marginBottom: '0.5rem',
                                        fontSize: '0.8rem',
                                        opacity: 0.8,
                                        cursor: 'pointer'
                                    }}>
                                        <div className="mono-text" style={{ color: isMe ? 'var(--neon-green)' : 'var(--neon-blue)', marginBottom: '2px', fontSize: '0.7rem' }}>
                                            {msg.metadata.replyTo.sender === senderId ? 'SENİN MESAJIN' : 'ALINTI'}
                                        </div>
                                        <div style={{ color: 'var(--text-muted)' }}>
                                            {msg.metadata.replyTo.type === 'radar' ? '[RADAR KOORDİNATI]' :
                                                msg.metadata.replyTo.type === 'voice' ? '[SES İZİ YANITI]' :
                                                    msg.metadata.replyTo.text || '[MEDYA]'}
                                        </div>
                                    </div>
                                )}

                                {msg.metadata?.type === 'radar' ? (
                                    <div style={{ position: 'relative', width: '200px', height: '150px', background: 'rgba(0,20,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <div className="radar-sweep" style={{ position: 'absolute', width: '100%', height: '100%', borderRight: '2px solid var(--neon-green)', borderRadius: '50%', opacity: 0.5 }}></div>
                                        <div style={{ position: 'absolute', width: '20px', height: '20px', background: 'var(--alert-red)', borderRadius: '50%', boxShadow: 'var(--glow-red)' }}></div>
                                        <div className="mono-text" style={{ position: 'absolute', bottom: '8px', fontSize: '0.6rem', color: 'var(--neon-green)', background: 'rgba(0,0,0,0.5)', padding: '2px 4px' }}>
                                            LAT: {msg.metadata.lat} <br /> LNG: {msg.metadata.lng}
                                        </div>
                                    </div>
                                ) : msg.metadata?.type === 'voice' ? (
                                    <div
                                        onClick={(e) => { e.stopPropagation(); if (msg.metadata.media_url) playVoicePrint(msg.metadata.media_url); }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,0,0,0.4)', padding: '10px', borderRadius: '8px', cursor: 'pointer', border: `1px solid ${isMe ? 'var(--neon-green)' : 'var(--neon-blue)'}` }}
                                    >
                                        <div style={{ padding: '8px', background: isMe ? 'rgba(0,255,65,0.1)' : 'rgba(0,240,255,0.1)', borderRadius: '50%' }}>
                                            <Mic size={16} />
                                        </div>
                                        <div style={{ display: 'flex', gap: '3px', height: '24px', alignItems: 'center' }}>
                                            {/* Fake Neon Waveform Bars */}
                                            {Array.from({ length: 15 }).map((_, i) => (
                                                <div key={i} className="voice-bar" style={{ height: `${Math.max(20, Math.random() * 100)}%` }}></div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {msg.media_url && (
                                            <div style={{ position: 'relative' }}>
                                                <img
                                                    src={msg.media_url}
                                                    alt="Encrypted attachment"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (!decryptedImages[msg.id]) {
                                                            toggleDecryption(msg.id);
                                                        }
                                                    }}
                                                    onPointerDown={(e) => {
                                                        if (decryptedImages[msg.id]) {
                                                            handlePointerDown(msg.id, !!msg.metadata?.hidden_text);
                                                        }
                                                    }}
                                                    onPointerUp={handlePointerUpOrLeave}
                                                    onPointerLeave={handlePointerUpOrLeave}
                                                    onContextMenu={(e) => {
                                                        // Prevent context menu on long press on mobile
                                                        if (msg.metadata?.hidden_text && decryptedImages[msg.id]) {
                                                            e.preventDefault();
                                                        }
                                                    }}
                                                    className={decryptedImages[msg.id] ? "decrypted-media" : "encrypted-media"}
                                                    style={{
                                                        maxWidth: '100%',
                                                        borderRadius: '8px',
                                                        border: `1px solid ${isMe ? 'var(--neon-green)' : 'var(--neon-blue)'}`,
                                                        display: 'block',
                                                        userSelect: 'none', // Prevent text selection on long press
                                                        WebkitTouchCallout: 'none' // Prevent default iOS popup
                                                    }}
                                                />
                                                {!decryptedImages[msg.id] && (
                                                    <div
                                                        className="mono-text cursor-blink"
                                                        style={{
                                                            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                                            color: 'var(--alert-red)', textShadow: 'var(--glow-red)', fontSize: '0.8rem',
                                                            background: 'rgba(0,0,0,0.7)', padding: '4px 8px', borderRadius: '4px', pointerEvents: 'none'
                                                        }}
                                                    >
                                                        ŞİFREYİ_ÇÖZ
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {msg.metadata?.hidden_text && revealedSteganography[msg.id] && (
                                            <div style={{
                                                marginTop: '8px', padding: '8px', background: 'rgba(0,255,65,0.05)',
                                                border: '1px solid var(--neon-green)', borderRadius: '4px',
                                                fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--neon-green)',
                                                textShadow: 'var(--glow-green)'
                                            }}>
                                                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '4px' }}>[GİZLİ MESAJ ÇÖZÜLDÜ]</div>
                                                {msg.metadata.hidden_text}
                                            </div>
                                        )}
                                        {msg.text && <div>{msg.text}</div>}
                                    </>
                                )}
                            </div>
                            {/* Reply Action Hint - shown on hover or subtly */}
                            <div className="mono-text reply-hint" onClick={() => setQuotedMessage(msg)} style={{
                                fontSize: '0.6rem', color: 'var(--text-muted)', textAlign: isMe ? 'right' : 'left',
                                cursor: 'pointer', padding: '0 4px', opacity: 0.5, transition: 'opacity 0.2s',
                                marginTop: '-2px'
                            }}>
                                YANITLA
                            </div>
                        </div>
                    );
                })}

                {/* Typing Indicator */}
                {isTargetTyping && (
                    <div style={{
                        alignSelf: 'flex-start',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '0.5rem 1rem',
                        marginTop: '0.5rem'
                    }}>
                        <Shield className="text-neon-blue blink" size={16} />
                        <span className="mono-text cursor-blink" style={{ color: 'var(--neon-blue)', fontSize: '0.75rem', textShadow: '0 0 5px rgba(0, 240, 255, 0.5)' }}>
                            [HEDEF VERİ AKTARIYOR - ŞİFRE ÇÖZÜLÜYOR...]
                        </span>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </main>

            {/* Input Area */}
            <footer className="glass-panel" style={{
                padding: '1rem', borderTop: '1px solid var(--panel-border)', borderBottom: 'none', borderLeft: 'none', borderRight: 'none',
                borderRadius: 0, zIndex: 10, display: 'flex', flexDirection: 'column', gap: '0.5rem'
            }}>

                {/* Quoted Message Preview Bar */}
                {quotedMessage && (
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: 'rgba(0,0,0,0.6)', borderLeft: '4px solid var(--neon-blue)', borderRadius: '8px', padding: '0.5rem 1rem',
                        color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem'
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <span className="mono-text" style={{ color: 'var(--neon-blue)', fontSize: '0.7rem' }}>
                                YANITLANAN: {quotedMessage.sender === senderId ? 'Sen' : targetId}
                            </span>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
                                {quotedMessage.metadata?.type === 'radar' ? '[RADAR KOORDİNATI]' :
                                    quotedMessage.metadata?.type === 'voice' ? '[SES İZİ YANITI]' :
                                        quotedMessage.text || '[MEDYA]'}
                            </span>
                        </div>
                        <button onClick={() => setQuotedMessage(null)} style={{ background: 'transparent', border: 'none', color: 'var(--alert-red)', cursor: 'pointer' }}>
                            <X size={16} />
                        </button>
                    </div>
                )}

                {/* Attachment Preview */}
                {selectedFile && (
                    <div style={{
                        display: 'flex', flexDirection: 'column', gap: '0.5rem',
                        background: 'rgba(0,0,0,0.6)', border: '1px solid var(--alert-red)', borderRadius: '8px', padding: '0.75rem',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span className="mono-text" style={{ color: 'var(--alert-red)', textShadow: 'var(--glow-red)', fontSize: '0.8rem' }}>
                                EKLENDİ: {selectedFile.name}
                            </span>
                            <button onClick={() => { setSelectedFile(null); setSecretMessage(""); }} style={{ background: 'transparent', border: 'none', color: 'var(--alert-red)', cursor: 'pointer' }}>
                                <X size={16} />
                            </button>
                        </div>
                        <input
                            type="text"
                            value={secretMessage}
                            onChange={e => setSecretMessage(e.target.value)}
                            placeholder="GİZLİ MESAJ (İsteğe Bağlı - Steganografi)"
                            className="mono-text"
                            style={{
                                background: 'rgba(255,0,0,0.1)', border: '1px solid var(--alert-red)', borderRadius: '4px', padding: '0.5rem',
                                color: 'var(--text-main)', outline: 'none', fontSize: '0.75rem'
                            }}
                        />
                    </div>
                )}

                <form onSubmit={sendMessage} className="chat-footer-form" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', width: '100%' }}>

                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                        accept="image/*,video/*"
                    />

                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            background: 'transparent', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '0.75rem',
                            color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                        title="Dosya Yükle"
                    >
                        <Paperclip size={18} />
                    </button>

                    <button
                        type="button"
                        onClick={sendLocation}
                        style={{
                            background: 'transparent', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '0.75rem',
                            color: 'var(--neon-blue)', cursor: 'pointer', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                        title="Radar GPS Gönder"
                    >
                        <MapPin size={18} />
                    </button>

                    <button
                        type="button"
                        onClick={() => setBurnModeActive(!burnModeActive)}
                        style={{
                            background: burnModeActive ? 'rgba(255,0,60,0.1)' : 'transparent',
                            border: `1px solid ${burnModeActive ? 'var(--alert-red)' : 'var(--panel-border)'}`,
                            borderRadius: '8px', padding: '0.75rem',
                            color: burnModeActive ? 'var(--alert-red)' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: burnModeActive ? 'var(--glow-red)' : 'none'
                        }}
                        title="Burn Protokolünü Aç/Kapat"
                    >
                        <Flame size={18} />
                    </button>

                    <div style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
                        <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            disabled={isUploading || isRecording}
                            placeholder={isUploading ? "VERİ ŞİFRELENİYOR..." : isRecording ? "SES İZİ KAYDEDİLİYOR..." : "MESAJ GİRİN..."}
                            className="mono-text"
                            style={{
                                flex: 1, background: isRecording ? 'rgba(255,0,60,0.1)' : 'rgba(0,0,0,0.6)', border: `1px solid ${isRecording ? 'var(--alert-red)' : 'var(--panel-border)'}`, borderRadius: '8px', padding: '0.75rem 1rem',
                                color: isRecording ? 'var(--alert-red)' : 'var(--text-main)', outline: 'none', fontSize: '0.9rem', transition: 'all 0.3s'
                            }}
                        />

                        {isRecording ? (
                            <button
                                type="button"
                                onClick={stopRecording}
                                style={{
                                    background: 'transparent', border: '1px solid var(--alert-red)', borderRadius: '8px', padding: '0.75rem',
                                    color: 'var(--alert-red)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: 'inset 0 0 10px rgba(255,0,0,0.2)'
                                }}
                                title="Kaydı Durdur"
                            >
                                <Square size={18} fill="currentColor" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={startRecording}
                                disabled={isUploading}
                                style={{
                                    background: 'transparent', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '0.75rem',
                                    color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                                title="Ses İzi Kaydet"
                            >
                                <Mic size={18} />
                            </button>
                        )}

                        <button
                            type="submit"
                            disabled={(!input.trim() && !selectedFile && !isRecording) || isUploading}
                            style={{
                                background: (input.trim() || selectedFile) ? 'rgba(0,255,65,0.1)' : 'transparent',
                                border: `1px solid ${(input.trim() || selectedFile) ? 'var(--neon-green)' : 'var(--panel-border)'}`,
                                borderRadius: '8px', padding: '0.75rem',
                                color: (input.trim() || selectedFile) ? 'var(--neon-green)' : 'var(--text-muted)',
                                cursor: (input.trim() || selectedFile) && !isUploading ? 'pointer' : 'not-allowed',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease'
                            }}
                        >
                            <Send size={18} style={{ filter: (input.trim() || selectedFile) ? 'drop-shadow(0 0 5px rgba(0,255,65,0.5))' : 'none', marginLeft: '2px' }} />
                        </button>
                    </div>
                </form>
            </footer>
        </div>
    );
}
