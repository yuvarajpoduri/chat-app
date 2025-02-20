import React, { useRef, useState, useEffect } from 'react';
import './App.css';
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, collection, addDoc, serverTimestamp, orderBy, query, limit } from "firebase/firestore";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollectionData } from 'react-firebase-hooks/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDrGV3ZSNq6YHFACRTi6umrOiHJGw5uaY4",
  authDomain: "room-829.firebaseapp.com",
  projectId: "room-829",
  storageBucket: "room-829.appspot.com",
  messagingSenderId: "890052258350",
  appId: "1:890052258350:web:b25850535c2c1a71e64dbf",
  measurementId: "G-RFYEGWP1B7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);
const messaging = getMessaging(app);

function App() {
  const [user] = useAuthState(auth);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  return (
    <div className="App">
      <header>
        <h1>Room 829</h1>
        <SignOut />
      </header>
      <section>{user ? <ChatRoom /> : <SignIn />}</section>
    </div>
  );
}

// Request Notification Permission
const requestNotificationPermission = async () => {
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      const token = await getToken(messaging, { vapidKey: "BDVWyl9FbzZowmHenhBfVZ0EN0yLxe1pBGQ8LHn49LuQDRklZ5KIWSJGF6-YqB5MuZes8GL5Jdkfl5ixwgdE8LY" });
      console.log("FCM Token:", token);
    } else {
      console.log("Notification permission denied");
    }
  } catch (error) {
    console.error("Error getting notification permission:", error);
  }
};

function SignIn() {
  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  return (
    <>
      <button className="sign-in" onClick={signInWithGoogle}>Sign in with Google</button>
      <p>Do not violate the community guidelines or you will be banned for life!</p>
    </>
  );
}

function SignOut() {
  return auth.currentUser && (
    <button className="sign-out" onClick={() => signOut(auth)}>Sign Out</button>
  );
}

function ChatRoom() {
  const dummy = useRef();
  const messagesRef = collection(firestore, "messages");
  const q = query(messagesRef, orderBy("createdAt"), limit(25));
  const [messages] = useCollectionData(q, { idField: 'id' });
  const [formValue, setFormValue] = useState('');

  const sendMessage = async (e) => {
    e.preventDefault();
    const { uid, photoURL, displayName } = auth.currentUser;

    const messageData = {
      text: formValue,
      createdAt: serverTimestamp(),
      uid,
      photoURL,
      displayName
    };

    await addDoc(messagesRef, messageData);
    setFormValue('');
    dummy.current.scrollIntoView({ behavior: 'smooth' });

    sendNotification(messageData);
  };

  return (
    <>
      <main>
        {messages && messages.map(msg => <ChatMessage key={msg.id} message={msg} />)}
        <span ref={dummy}></span>
      </main>
      <form onSubmit={sendMessage}>
        <input value={formValue} onChange={(e) => setFormValue(e.target.value)} placeholder="Say something nice" />
        <button type="submit" disabled={!formValue}>➤</button>
      </form>
    </>
  );
}

// Function to Send Notification
const sendNotification = async (messageData) => {
  if (Notification.permission === "granted") {
    new Notification(`${messageData.displayName} sent a message`, {
      body: messageData.text,
      icon: messageData.photoURL || "https://api.adorable.io/avatars/23/avatar.png",
    });
  }
};

function ChatMessage(props) {
  const { text, uid, photoURL, displayName, createdAt } = props.message;
  const messageClass = uid === auth.currentUser?.uid ? 'sent' : 'received';
  const timestamp = createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`message ${messageClass}`}>
      <img src={photoURL || 'https://api.adorable.io/avatars/23/avatar.png'} alt="User" />
      <div>
        <small style={{ color: 'white', fontWeight: 'bold' }}>{displayName}</small>
        <p>{text}</p>
        <small style={{ color: 'white', fontSize: '0.8em' }}>{timestamp}</small>
      </div>
    </div>
  );
}

export default App;
