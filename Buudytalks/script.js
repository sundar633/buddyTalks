const SUPABASE_URL = 'URL';
const SUPABASE_ANON_KEY = 'KEY';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const userName = localStorage.getItem('name') || "User";
const userMobile = localStorage.getItem('mobile') || "";
document.getElementById('userName').textContent = userName;
if (!userName || !userMobile) {
  window.location.href = "../index.html";
}
let pc = null;
let localStream = null;
let remoteStream = null;
let currentCall = null;
let pendingCandidates = [];

// ------------------ Get Local Media ------------------
async function getLocalStream() {
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const localVideo = document.getElementById("localVideo");
      localVideo.srcObject = localStream;
      localVideo.autoplay = true;
      localVideo.muted = true;
      localVideo.playsInline = true;
      localVideo.style.width = "25%";
      localVideo.style.height = "auto";
      localVideo.style.position = "absolute";
      localVideo.style.top = "15px";
      localVideo.style.right = "15px";
      localVideo.style.zIndex = 2100;
      console.log("✅ Local stream initialized:", localStream.getTracks());
    } catch (err) {
      console.error("❌ Cannot access camera/mic:", err);
      alert("Camera/Microphone access denied!");
      throw err;
    }
  }
  return localStream;
}

// ------------------ Create Peer Connection ------------------
function createPeerConnection() {
  pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ]
  });

  console.log("🔗 Peer connection created");

  remoteStream = new MediaStream();
  const remoteVideo = document.getElementById("remoteVideo");
  remoteVideo.srcObject = remoteStream;
  remoteVideo.autoplay = true;
  remoteVideo.playsInline = true;
  remoteVideo.muted = true;
  remoteVideo.style.width = "100%";
  remoteVideo.style.height = "100%";
  remoteVideo.style.objectFit = "cover";

  // ------------------ Remote Track ------------------
  pc.ontrack = (event) => {
    console.log("📹 Remote track received:", event.track.kind);
    remoteStream.addTrack(event.track);

    if (event.track.kind === "video") {
      remoteVideo.onloadedmetadata = () => {
        remoteVideo.play().catch(err => {
          console.warn("❌ Remote video autoplay failed:", err);
          remoteVideo.muted = true;
          remoteVideo.play().catch(err => console.error("❌ Playback failed again:", err));
        });
      };
    }
  };

  // ------------------ ICE Candidate ------------------
  pc.onicecandidate = async (event) => {
    if (!currentCall?.id) return;
    console.log("📡 ICE candidate event:", event.candidate);
    if (event.candidate) {
      try {
        const { error } = await supabase.from("ice_candidates").insert([{
          call_id: currentCall.id,
          sender_mobile: userMobile,
          candidate: event.candidate.toJSON()
        }]);
        if (error) console.error("❌ ICE candidate send error:", error);
        else console.log("✅ ICE candidate sent");
      } catch (err) {
        console.error("❌ Exception sending ICE candidate:", err);
      }
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log("📡 ICE connection state:", pc.iceConnectionState);
    if (["failed", "disconnected"].includes(pc.iceConnectionState)) endCallUI();
  };

  pc.onconnectionstatechange = () => {
    console.log("🔗 Connection state:", pc.connectionState);
    if (["failed", "disconnected"].includes(pc.connectionState)) endCallUI();
  };

  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    console.log("✅ Local tracks added to peer connection");
  }
}

// ------------------ Start Call ------------------
document.getElementById("videoCallBtn").addEventListener("click", async () => {
  if (!currentChat) return alert("Select a chat first!");
  await getLocalStream();
  createPeerConnection();

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log("✅ Local description set with offer");

    const { data, error } = await supabase.from("calls")
      .insert([{
        caller_mobile: userMobile,
        receiver_mobile: currentChat,
        offer: pc.localDescription,
        status: "ringing"
      }]).select();

    if (error) return console.error("❌ Error inserting call record:", error);

    currentCall = data[0];

    // ------------------ Outgoing Call Popup ------------------
    document.getElementById("outgoingCallPopup")?.remove();

    const popup = document.createElement("div");
    popup.id = "outgoingCallPopup";
    Object.assign(popup.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      background: "white",
      padding: "20px",
      borderRadius: "12px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      zIndex: 3000,
      textAlign: "center",
      width: "280px",
      maxWidth: "90%"
    });

    const text = document.createElement("p");
    text.textContent = `📞 Calling ${currentChat}...`;
    text.style.marginBottom = "15px";
    popup.appendChild(text);

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel Call";
    Object.assign(cancelBtn.style, {
      padding: "10px 20px",
      border: "none",
      borderRadius: "8px",
      background: "red",
      color: "white",
      cursor: "pointer"
    });
    cancelBtn.onclick = async () => {
      if (currentCall) {
        await supabase.from("calls").update({ status: "ended" }).eq("id", currentCall.id);
        currentCall = null;
      }
      popup.remove();
      endCallUI();
    };
    popup.appendChild(cancelBtn);

    document.body.appendChild(popup);

    console.log("✅ Call record inserted:", currentCall);
  } catch (err) {
    console.error("❌ Offer creation failed:", err);
  }
});

// ------------------ Accept Call ------------------
document.getElementById("acceptCallBtn").addEventListener("click", async () => {
  if (!currentCall) return;
  await acceptCall(currentCall);
});

async function acceptCall(call) {
  await getLocalStream();
  createPeerConnection();

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(call.offer));
    console.log("✅ Remote description set with offer");

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    console.log("✅ Local description set with answer");

    await supabase.from("calls").update({
      answer: pc.localDescription,
      status: "accepted"
    }).eq("id", call.id);

    console.log("✅ Answer saved to database");

    for (const c of pendingCandidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
        console.log("✅ Pending ICE candidate added");
      } catch (err) {
        console.warn("❌ Failed to add pending ICE candidate:", err);
      }
    }
    pendingCandidates = [];

    document.getElementById("incomingCall").classList.add("hidden");
    document.getElementById("outgoingCallPopup")?.remove(); // close outgoing popup if this side was caller
    showActiveCall(true);

    const remoteVideo = document.getElementById("remoteVideo");
    setTimeout(() => {
      remoteVideo.play().catch(err => console.warn("❌ Autoplay failed after accept:", err));
      remoteVideo.muted = false;
    }, 100);
  } catch (err) {
    console.error("❌ Error accepting call:", err);
  }
}
// ------------------ End Call ------------------
document.getElementById("declineCallBtn").addEventListener("click", async () => {
  if (!currentCall) return;
  await supabase.from("calls").update({ status: "ended" }).eq("id", currentCall.id);
  document.getElementById("incomingCall").classList.add("hidden");
  document.getElementById("outgoingCallPopup")?.remove();
  currentCall = null;
  console.log("📴 Call declined");
});

document.getElementById("endCallBtn").addEventListener("click", async () => {
  if (currentCall) {
    await supabase.from("calls").update({ status: "ended" }).eq("id", currentCall.id);
    console.log("📴 Call ended by user");
  }
  document.getElementById("outgoingCallPopup")?.remove();
  endCallUI();
});

const endCallContainer = document.getElementById("endCallBtn")?.parentElement;
if (endCallContainer) {
  const cameraToggleBtn = document.createElement("button");
  cameraToggleBtn.id = "toggleCameraBtn";

  // Create image element
  const cameraImg = document.createElement("img");
  cameraImg.src = "img/camon.png"; // Initial state: camera is ON
  cameraImg.alt = "Toggle Camera";
  Object.assign(cameraImg.style, {
    width: "35px",
    height: "35px"
  });

  cameraToggleBtn.appendChild(cameraImg);

  Object.assign(cameraToggleBtn.style, {
     padding: "10px 20px",
  marginLeft: "169px",
  marginTop: "2px", // move it upward
  border: "none",
  borderRadius: "8px",
  background: "transparent",

    color: "white",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  });

  let cameraOn = true;

  cameraToggleBtn.addEventListener("click", () => {
    if (!localStream) return;

    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    if (cameraOn) {
      videoTrack.enabled = false;
      cameraImg.src = "img/camof.png"; // Camera turned OFF
      console.log("📷 Camera turned OFF");
    } else {
      videoTrack.enabled = true;
      cameraImg.src = "img/camon.png"; // Camera turned ON
      console.log("📷 Camera turned ON");
    }
    cameraOn = !cameraOn;
  });

  endCallContainer.appendChild(cameraToggleBtn);
}


// ------------------ End Call UI ------------------
function endCallUI() {
  if (pc) pc.close();
  pc = null;

  if (localStream) localStream.getTracks().forEach(track => track.stop());
  localStream = null;
  remoteStream = null;
  currentCall = null;
  pendingCandidates = [];

  document.getElementById("activeCall").classList.add("hidden");
  document.getElementById("miniCallPopup")?.classList.add("hidden");
  document.getElementById("incomingCall").classList.add("hidden");
  document.getElementById("outgoingCallPopup")?.remove();

  // ✅ Optional: Reset toggle button icon and state
  const cameraToggleBtn = document.getElementById("toggleCameraBtn");
  if (cameraToggleBtn) {
    cameraToggleBtn.textContent = "📷❌";
  }

  console.log("✅ Call UI reset");
}


// ------------------ Toggle Fullscreen / Mini Call ------------------
function showActiveCall(fullscreen = true) {
  const activeCall = document.getElementById("activeCall");
  const miniCall = document.getElementById("miniCallPopup");

  if (fullscreen) {
    activeCall.classList.remove("hidden");
    miniCall.classList.add("hidden");
  } else {
    activeCall.classList.add("hidden");
    miniCall.classList.remove("hidden");

    // ✅ Copy remote stream to mini
    const remoteVideo = document.getElementById("remoteVideo");
    const miniRemoteVideo = document.getElementById("miniRemoteVideo");
    if (remoteVideo.srcObject) {
      miniRemoteVideo.srcObject = remoteVideo.srcObject;
    }
  }
}

document.getElementById("minimizeCallBtn")?.addEventListener("click", () => showActiveCall(false));
document.getElementById("expandCallBtn")?.addEventListener("click", () => showActiveCall(true));
document.getElementById("endCallBtn")?.addEventListener("click", () => endCallUI());

// ------------------ Supabase Signaling ------------------
supabase.channel("calls_channel")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls" }, async payload => {
    const call = payload.new;
    if (call.receiver_mobile === userMobile && call.status === "ringing") {
      currentCall = call;
      document.getElementById("callerName").textContent = call.caller_mobile;
      document.getElementById("incomingCall").classList.remove("hidden");
      console.log("📞 Incoming call from", call.caller_mobile);
    }
  })
  .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls" }, async payload => {
    const call = payload.new;
    if (!currentCall || call.id !== currentCall.id) return;

    if (call.answer && pc?.signalingState !== "stable") {
      await pc.setRemoteDescription(new RTCSessionDescription(call.answer));
      for (const c of pendingCandidates) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); console.log("✅ Pending ICE candidate added"); }
        catch (err) { console.warn("❌ Failed to add pending ICE candidate:", err); }
      }
      pendingCandidates = [];
      showActiveCall(true);
      document.getElementById("incomingCall").classList.add("hidden");
      document.getElementById("outgoingCallPopup")?.remove();
    }

    if (call.status === "ended") endCallUI();
  })
  .subscribe();

// ------------------ ICE Candidate Listener ------------------
supabase.channel("ice_candidates_channel")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "ice_candidates" }, async payload => {
    const row = payload.new;
    if (!currentCall || row.call_id !== currentCall.id || row.sender_mobile === userMobile) return;

    const candidate = new RTCIceCandidate(row.candidate);
    if (pc && pc.remoteDescription) {
      try {
        await pc.addIceCandidate(candidate);
        console.log("✅ Remote ICE candidate added");
      } catch (err) {
        console.warn("❌ Failed to add ICE candidate:", err);
      }
    } else {
      pendingCandidates.push(row.candidate);
      console.log("💡 ICE candidate queued for later");
    }
  })
  .subscribe();

// ------------------ Debugging ------------------
function logStatus() {
  const remoteVideo = document.getElementById("remoteVideo");
  console.log({
    iceState: pc ? pc.iceConnectionState : "no pc",
    connectionState: pc ? pc.connectionState : "no pc",
    remoteDescriptionSet: pc ? !!pc.remoteDescription : "no pc",
    remoteStreamTracks: remoteVideo.srcObject ? remoteVideo.srcObject.getTracks().map(t => t.kind) : [],
    remoteVideoPlaying: !remoteVideo.paused && !remoteVideo.ended && remoteVideo.readyState > 2
  });
}





// ------------------- working code dot touch -------------------
document.getElementById('userName').textContent = userName;
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const welcomeContainer = document.getElementById('welcomeContainer');
const mainContent = document.getElementById('mainContent');
const recentChatsDiv = document.getElementById('recentChats');
const searchWrapper = document.querySelector('.search-wrapper');

const chatWindow = document.getElementById('chatWindow');
const chatUserName = document.getElementById('chatUserName');
const chatUserMobile = document.getElementById('chatUserMobile');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const backBtn = document.getElementById('backBtn');

let currentChat = null;
let chats = {}; 

// ------------------- Load Messages-------------------
async function loadMessages() {
  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .or(`sender_mobile.eq.${userMobile},receiver_mobile.eq.${userMobile}`)
    .order('created_at', { ascending: true });

  if (error) {
    console.error("Error loading messages:", error);
    return;
  }

  for (const msg of messages) {
    const otherMobile = msg.sender_mobile === userMobile ? msg.receiver_mobile : msg.sender_mobile;

    
    if (!chats[otherMobile]) {
      let otherName = otherMobile;
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('name')
        .eq('mobile', otherMobile)
        .single();

      if (!userError && userData) {
        otherName = userData.name;
      }

      chats[otherMobile] = { name: otherName, messages: [] };
    }

    chats[otherMobile].messages.push({
      sender: msg.sender_mobile,
      message: msg.content,
      isSeen: msg.is_seen,
      receiver_mobile: msg.receiver_mobile
    });
  }

  updateRecentChats();
}
const placeholders = [
  "Search For Buddies... 🐶👫💬",
  "Find your best friend! 🐾💖",
  "Looking for chat pals? 💬👯",
  "Start a new conversation! 🗨️✨"
];


let index = 0;

setInterval(() => {
  // Start fade-out animation
  searchInput.classList.add('fade-out-placeholder');
  
  // After fade-out ends (300ms), change placeholder and fade in
  setTimeout(() => {
    index = (index + 1) % placeholders.length;
    searchInput.placeholder = placeholders[index];

    searchInput.classList.remove('fade-out-placeholder');
    searchInput.classList.add('fade-in-placeholder');

    // Remove fade-in class after animation finishes to reset
    setTimeout(() => {
      searchInput.classList.remove('fade-in-placeholder');
    }, 300);

  }, 300);
}, 2000);


// ------------------- Search Users -------------------
searchInput.addEventListener('input', async () => {
  const query = searchInput.value.trim();
  searchResults.innerHTML = '';
  if (query.length < 3) {
    searchResults.style.display = 'none';
    return;
  }

  const { data: users, error } = await supabase
    .from('users')
    .select('name,mobile')
    .or(`mobile.ilike.%${query}%,name.ilike.%${query}%`);

  if (error) {
    console.error(error);
    return;
  }

  const seen = new Set();
  const uniqueUsers = users.filter(u => u.mobile !== userMobile && !seen.has(u.mobile) && seen.add(u.mobile));

  if (uniqueUsers.length === 0) {
    searchResults.innerHTML = `<p class="no-results">No buddies found</p>`;
  } else {
    uniqueUsers.forEach(user => {
      const div = document.createElement('div');
      div.className = 'result-card';
      div.innerHTML = `<span class="result-name">${user.name}</span><span class="result-mobile">${user.mobile}</span>`;
      div.addEventListener('click', () => startChat(user));
      searchResults.appendChild(div);
    });
  }
  searchResults.style.display = 'block';
});

document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrapper')) searchResults.style.display = 'none';
});

// ------------------- Start Chat -------------------
async function startChat(user) {
  currentChat = user.mobile;
  if (!chats[currentChat]) chats[currentChat] = { name: user.name, messages: [] };

  chatUserName.textContent = user.name;
  chatUserMobile.textContent = user.mobile;

  chatMessages.innerHTML = '';
  chats[currentChat].messages.forEach(msg => addMessageToWindow(msg.sender, msg.message, msg.isSeen));

  chatWindow.classList.remove('hidden');
  mainContent.classList.add('hidden');
  searchWrapper.classList.add('hidden');

  searchInput.value = '';
  searchResults.innerHTML = '';
  searchResults.style.display = 'none';

  await markMessagesAsSeen();
}

// ------------------- Mark Messages as Seen -------------------
async function markMessagesAsSeen() {
  const { error } = await supabase
    .from('messages')
    .update({ is_seen: true })
    .eq('receiver_mobile', userMobile)
    .eq('sender_mobile', currentChat)
    .eq('is_seen', false);

  if (error) {
    console.error("Error marking messages as seen:", error);
  } else {
    if (chats[currentChat]) {
      chats[currentChat].messages.forEach(msg => {
        if (msg.receiver_mobile === userMobile) {
          msg.isSeen = true;
        }
      });
    }
    updateRecentChats();
  }
}

// ------------------- Send Message -------------------
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', e => {
  if (e.key === 'Enter') sendMessage();
});

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentChat) return;

  const { data, error } = await supabase
    .from('messages')
    .insert([
      {
        sender_mobile: userMobile,
        receiver_mobile: currentChat,
        content: text,
        is_seen: false
      }
    ])
    .select();

  if (error) {
    console.error("Error sending message:", error);
    return;
  }

  const newMessage = data[0];

  if (!chats[currentChat]) chats[currentChat] = { name: chatUserName.textContent, messages: [] };
  chats[currentChat].messages.push({
    sender: userMobile,
    message: text,
    isSeen: false,
    id: newMessage.id, 
    receiver_mobile: currentChat
  });

  addMessageToWindow(userMobile, text, false, newMessage.id);
  messageInput.value = '';

  updateRecentChats();
}


function addMessageToWindow(sender, text, isSeen = false, messageId = null) {
  const div = document.createElement('div');
  div.className = 'message ' + (sender === userMobile ? 'sent' : 'received');

  // Check if text is an image URL (basic check)
  if (text.startsWith('https://') && (text.endsWith('.jpg') || text.endsWith('.jpeg') || text.endsWith('.png') || text.includes('profile-image'))) {
    const img = document.createElement('img');
    img.src = text;
    img.alt = "Image";
    img.className = "chat-image";
    div.appendChild(img);
  } else {
    div.textContent = text;
  }

  if (sender === userMobile) {
    const tick = document.createElement('span');
    tick.className = 'tick';
    tick.textContent = isSeen ? '✔✔' : '✔';
    div.appendChild(tick);
  }

  if (messageId) {
    div.dataset.messageId = messageId;
  }

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}


// ------------------- Back Button -------------------
backBtn.addEventListener('click', () => {
  chatWindow.classList.add('hidden');
  mainContent.classList.remove('hidden');
  searchWrapper.classList.remove('hidden');
  currentChat = null;
  updateRecentChats();
});

// ------------------- Update Recent Chats -------------------

function updateRecentChats() {
  recentChatsDiv.innerHTML = '';
  const chatKeys = Object.keys(chats);

  if (chatKeys.length === 0) {
    welcomeContainer.classList.remove('hidden');
    mainContent.classList.add('hidden');
    return;
  }

  welcomeContainer.classList.add('hidden');
  mainContent.classList.remove('hidden');

  chatKeys.forEach(mobile => {
  const div = document.createElement('div');
  div.className = 'recent-card';

  // Automatically mark messages as seen if this chat is open
  if (currentChat === mobile) {
    chats[mobile].messages.forEach(msg => {
      if (msg.receiver_mobile === userMobile) msg.isSeen = true;
    });
  }

  // Count only unseen messages
  const unreadCount = chats[mobile].messages.filter(
    msg => msg.receiver_mobile === userMobile && !msg.isSeen
  ).length;

 div.innerHTML = `
  <span class="recent-name">${chats[mobile].name}</span>
  ${unreadCount > 0 ? `<span class="unread-count">(${unreadCount})</span>` : ''}
`;


  div.addEventListener('click', async () => {
    await startChat({ mobile, name: chats[mobile].name });
    updateRecentChats(); // Refresh unread count immediately
  });

  recentChatsDiv.appendChild(div);
});
}

// ------------------- Start Chat Button -------------------
document.getElementById('startChatBtn').addEventListener('click', () => {
  welcomeContainer.classList.add('hidden');
  mainContent.classList.remove('hidden');
  searchWrapper.classList.remove('hidden');
  updateRecentChats();
  searchInput.focus();
});

// ------------------- Profile Modal -------------------
const profileBtn = document.getElementById("profileBtn");
const profileModal = document.getElementById("profileModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const logoutModalBtn = document.getElementById("logoutModalBtn");
const modalName = document.getElementById("modalName");
const modalMobile = document.getElementById("modalMobile");
const profileImage = document.getElementById("profileImage");
const imageBtn = document.getElementById("imageBtn");
const profileImageInput = document.getElementById("profileImageInput");

// ✅ User info from localStorage
modalName.textContent = userName;
modalMobile.textContent = userMobile;

// ------------------- Modal Open/Close -------------------
profileBtn.addEventListener("click", () => profileModal.classList.remove("hidden"));
closeModalBtn.addEventListener("click", () => profileModal.classList.add("hidden"));
profileModal.addEventListener("click", (e) => {
  if (e.target === profileModal) profileModal.classList.add("hidden");
});

// ------------------- Logout -------------------
logoutModalBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  localStorage.clear();
  window.location.href = "../index.html";
});

// ------------------- Profile Image Upload -------------------
imageBtn.addEventListener("click", () => profileImageInput.click());

profileImageInput.addEventListener("change", async () => {
  const file = profileImageInput.files[0];
  if (!file || !userMobile) return;

  // New filename with timestamp to avoid caching issues
  const timestamp = Date.now();
  const newFilePath = `${userMobile}/profile-${timestamp}.jpg`;

  try {
    // 1️⃣ Fetch old image from DB
    const { data: existingData, error: fetchError } = await supabase
      .from("profile_images")
      .select("image_url")
      .eq("mobile", userMobile)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("❌ Error fetching existing image:", fetchError.message);
    }

    // 2️⃣ Delete old image from storage if it exists
    if (existingData?.image_url) {
      const url = new URL(existingData.image_url);
      // Extract path relative to bucket
      const oldPath = url.pathname.replace(/^\/storage\/v1\/object\/public\/user-profiles\//, "");

      if (oldPath) {
        const { error: deleteError } = await supabase
          .storage
          .from("user-profiles")
          .remove([oldPath]);

        if (deleteError) console.warn("⚠️ Could not delete old image:", deleteError.message);
      }
    }

    // 3️⃣ Upload new image
    const { error: uploadError } = await supabase.storage
      .from("user-profiles")
      .upload(newFilePath, file);

    if (uploadError) throw uploadError;

    // 4️⃣ Get public URL
    const { data: urlData, error: urlError } = supabase
      .storage
      .from("user-profiles")
      .getPublicUrl(newFilePath);

    if (urlError) throw urlError;

    const imageUrl = urlData.publicUrl;

    // 5️⃣ Update DB
    const { error: dbError } = await supabase
      .from("profile_images")
      .upsert([{ mobile: userMobile, image_url: imageUrl }], { onConflict: "mobile" });

    if (dbError) throw dbError;

    // 6️⃣ Update UI & localStorage
    profileImage.src = imageUrl + `?t=${Date.now()}`; // cache-busting
    imageBtn.textContent = "Change Image";
    localStorage.setItem("profileImage", imageUrl);

  } catch (err) {
    console.error("🔥 Unexpected error:", err);
    alert("Unexpected error: " + err.message);
  }
});


// ------------------- Load Profile Image -------------------
async function loadProfileImage() {
  if (!userMobile) {
    // If user is not logged in, show master logo
    profileImage.src = "img/default-profile.png";
    imageBtn.textContent = "Upload Image";
    return;
  }

  try {
    // 1️⃣ Try cache first
    const cachedImage = localStorage.getItem("profileImage");
    if (cachedImage) {
      profileImage.src = cachedImage;
      imageBtn.textContent = "Change Image";
      return;
    }

    // 2️⃣ Fetch from DB
    const { data, error } = await supabase
      .from("profile_images")
      .select("image_url")
      .eq("mobile", userMobile)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    // 3️⃣ If image exists, use it; otherwise fallback to default
    if (data?.image_url) {
      profileImage.src = data.image_url;
      imageBtn.textContent = "Change Image";
      localStorage.setItem("profileImage", data.image_url);
    } else {
      profileImage.src = "img/profilepic.jpg"; // master logo
      imageBtn.textContent = "Upload Image";
    }
  } catch (err) {
    console.error("❌ Error fetching profile image:", err);
    profileImage.src = "img/default-profile.png"; // master logo on error
    imageBtn.textContent = "Upload Image";
  }
}


// ✅ Run on page load
loadProfileImage();





// ------------------- Realtime Setup -------------------
function setupRealtime() {
  supabase.channel('messages_channel')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const msg = payload.new;

      // Ignore messages sent by this user to avoid duplicates
      if (msg.sender_mobile === userMobile) return;

      const otherMobile = msg.sender_mobile === userMobile ? msg.receiver_mobile : msg.sender_mobile;
      const name = msg.sender_name || msg.sender_mobile;

      if (!chats[otherMobile]) {
        chats[otherMobile] = { name: name, messages: [] };
      }

      chats[otherMobile].messages.push({
        sender: msg.sender_mobile,
        message: msg.content,
        isSeen: msg.is_seen,
        receiver_mobile: msg.receiver_mobile
      });

      if (currentChat === otherMobile) {
        addMessageToWindow(msg.sender_mobile, msg.content, msg.is_seen);
      }

      updateRecentChats();
    })
    .subscribe();
}

// ------------------- Initial Load -------------------
window.addEventListener('load', () => {
  loadMessages();
  updateRecentChats();
  setupRealtime();
  loadProfileImage();
});


const imageInput = document.getElementById('imageInput');
const cameraBtn = document.getElementById('cameraBtn');

// Open file picker or camera when attach button is clicked
cameraBtn.addEventListener('click', () => {
  imageInput.click();
});

// Handle file selection
imageInput.addEventListener('change', async () => {
  const file = imageInput.files[0];
  if (!file || !currentChat) return;

  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}.${fileExt}`;
  const filePath = `${userMobile}/${fileName}`;

  try {
    // Upload image to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('chat-images')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData, error: urlError } = await supabase.storage
      .from('chat-images')
      .getPublicUrl(filePath);

    if (urlError) throw urlError;

    const imageUrl = urlData.publicUrl;

    // Send image message
    const { data: messageData, error: insertError } = await supabase
      .from('messages')
      .insert([{
        sender_mobile: userMobile,
        receiver_mobile: currentChat,
        content: imageUrl,
        is_seen: false
      }])
      .select();

    if (insertError) throw insertError;

    const newMessage = messageData[0];

    // Update local chat
    if (!chats[currentChat]) chats[currentChat] = { name: chatUserName.textContent, messages: [] };
    chats[currentChat].messages.push({
      sender: userMobile,
      message: imageUrl,
      isSeen: false,
      id: newMessage.id,
      receiver_mobile: currentChat
    });

    addMessageToWindow(userMobile, imageUrl, false, newMessage.id);
    updateRecentChats();

  } catch (err) {
    console.error("Error handling image:", err);
    alert("Error sending image: " + err.message);
  } finally {
    imageInput.value = ''; // Reset file input
  }
});
// ------------------- Chat User Profile Popup -------------------
const userProfileBtn = document.getElementById("userprofile"); // the icon-button
const userProfilePopup = document.getElementById("userProfilePopup");
const popupName = document.getElementById("popupName");
const popupMobile = document.getElementById("popupMobile");
const popupProfileImage = document.getElementById("popupProfileImage");
const closeProfilePopup = document.getElementById("closeProfilePopup");

// Open the popup with current chat info
userProfileBtn.addEventListener("click", async () => {
  if (!currentChat) return alert("No chat is open!");

  // Set Name & Mobile
  popupName.textContent = chats[currentChat].name || currentChat;
  popupMobile.textContent = currentChat;

  // Default: hide the profile image first
  popupProfileImage.style.display = "none";

  try {
    const { data, error } = await supabase
      .from("profile_images")
      .select("image_url")
      .eq("mobile", currentChat)
      .single();

    if (!error && data?.image_url) {
      // Show actual profile image
      popupProfileImage.src = data.image_url + `?t=${Date.now()}`;
      popupProfileImage.style.display = "block";
    } else {
      // No image found, show default 1.png
      popupProfileImage.src = "img/profilepic.jpg";
      popupProfileImage.style.display = "block";
    }
  } catch (err) {
    console.error("Error loading chat user profile image:", err);
    popupProfileImage.src = "img/1.png";
    popupProfileImage.style.display = "block";
  }

  userProfilePopup.classList.remove("hidden");
});


// Close popup
closeProfilePopup.addEventListener("click", () => {
  userProfilePopup.classList.add("hidden");
});

// Close when clicking outside
userProfilePopup.addEventListener("click", e => {
  if (e.target === userProfilePopup) userProfilePopup.classList.add("hidden");
});

