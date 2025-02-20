import React, { useRef, useState } from 'react';
import './App.css';

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, collection, addDoc, serverTimestamp, orderBy, query, limit } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollectionData } from 'react-firebase-hooks/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDrGV3ZSNq6YHFACRTi6umrOiHJGw5uaY4",
  authDomain: "room-829.firebaseapp.com",
  projectId: "room-829",
  storageBucket: "room-829.appspot.com", // Corrected storage bucket URL
  messagingSenderId: "890052258350",
  appId: "1:890052258350:web:b25850535c2c1a71e64dbf",
  measurementId: "G-RFYEGWP1B7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);
const storage = getStorage(app);

function App() {
  const [user] = useAuthState(auth);
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
  const [file, setFile] = useState(null);
  
  const sendMessage = async (e) => {
    e.preventDefault();
    const { uid, photoURL, displayName } = auth.currentUser;
    
    let mediaUrl = null;
    if (file) {
      const storageRef = ref(storage, `uploads/${file.name}`);
      await uploadBytes(storageRef, file);
      mediaUrl = await getDownloadURL(storageRef);
      setFile(null); // Reset file input
    }

    await addDoc(messagesRef, {
      text: formValue,
      mediaUrl, // Store media file URL if uploaded
      createdAt: serverTimestamp(),
      uid,
      photoURL,
      displayName
    });

    setFormValue('');
    dummy.current.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <main>
        {messages && messages.map((msg, index) => (
          <ChatMessage key={msg.id || index} message={msg} />
        ))}
        <span ref={dummy}></span>
      </main>
      
      <form onSubmit={sendMessage}>
        <input 
          value={formValue} 
          onChange={(e) => setFormValue(e.target.value)} 
          placeholder="Say something nice" 
        />
        
        <input 
          type="file" 
          onChange={(e) => setFile(e.target.files[0])} 
          accept="image/*,video/*"
        />

        <button type="submit" disabled={!formValue && !file}>➤</button>
      </form>
    </>
  );
}

function ChatMessage(props) {
  const { text, uid, photoURL, displayName, createdAt, mediaUrl } = props.message;
  const messageClass = uid === auth.currentUser?.uid ? 'sent' : 'received';
  const timestamp = createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`message ${messageClass}`}>
      <img src={photoURL || 'https://api.adorable.io/avatars/23/avatar.png'} alt="User" />
      <div>
        <small style={{ color: 'white', fontWeight: 'bold' }}>{displayName}</small>
        {text && <p>{text}</p>}
        {mediaUrl && (
          <div className="media-container">
            {mediaUrl.match(/\.(jpeg|jpg|gif|png)$/) ? (
              <img src={mediaUrl} alt="Uploaded media" />
            ) : (
              <video controls>
                <source src={mediaUrl} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            )}
          </div>
        )}
        <small style={{ color: 'white', fontSize: '0.8em' }}>{timestamp}</small>
      </div>
    </div>
  );
}

export default App;
