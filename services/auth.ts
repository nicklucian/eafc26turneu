
import { auth as firebaseAuth, db as firebaseDb } from './firebase';
import { 
  onAuthStateChanged, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  type User as FirebaseUser
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { databaseService } from './db';
import { User, UserRole } from '../types';

export const authService = {
  // Listen for auth state changes
  onAuthStateChanged: (callback: (user: User | null, firebaseUser?: FirebaseUser | null) => void) => {
    if (!firebaseAuth) {
        console.warn("Auth service not ready: Firebase not initialized.");
        callback(null, null);
        return () => {};
    }

    return onAuthStateChanged(firebaseAuth, async (fbUser: FirebaseUser | null) => {
      if (fbUser) {
        if (!firebaseDb) {
            callback(null, fbUser);
            return;
        }
        // Fetch custom user profile from Firestore
        try {
            const userDoc = await getDoc(doc(firebaseDb, "users", fbUser.uid));
            if (userDoc.exists()) {
              callback(userDoc.data() as User, fbUser);
            } else {
              // Valid Auth, Missing Profile -> This indicates a Pending Registration (Ghost User)
              callback(null, fbUser);
            }
        } catch (e) {
            console.error("Error fetching user profile", e);
            callback(null, fbUser);
        }
      } else {
        callback(null, null);
      }
    });
  },

  signInWithGoogle: async (): Promise<{ user: User | null, firebaseUser: FirebaseUser, isNew: boolean }> => {
    if (!firebaseAuth) throw new Error("Firebase not initialized");
    
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(firebaseAuth, provider);
    const fbUser = result.user;

    // Check if profile exists
    const userDoc = await getDoc(doc(firebaseDb, "users", fbUser.uid));
    
    if (userDoc.exists()) {
        return { user: userDoc.data() as User, firebaseUser: fbUser, isNew: false };
    } else {
        return { user: null, firebaseUser: fbUser, isNew: true };
    }
  },

  // New method: Only called AFTER invite code is verified
  finalizeGoogleRegistration: async (firebaseUser: FirebaseUser, inviteCode: string): Promise<User> => {
     if (!firebaseDb) throw new Error("DB not ready");

     // 1. Verify Code Logic (Re-used from register)
     const codes = await databaseService.getCodes();
     const validCode = codes.find(c => c.code === inviteCode && c.isActive);
     
     // Bypass check if strictly admin/empty DB logic applies, 
     // but for Google Auth we usually want to enforce the code unless it's the very first user.
     const existingUsers = await databaseService.getUsers();
     const isFirstUser = existingUsers.length === 0;

     if (!isFirstUser && !validCode) {
        throw new Error('Invalid or inactive invitation code.');
     }

     // 2. Determine Role
     const role = isFirstUser ? UserRole.ADMIN : UserRole.MEMBER;

     // 3. Create Profile
     const newUser: User = {
        id: firebaseUser.uid,
        username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Unknown',
        role: role,
        avatar: firebaseUser.photoURL || undefined,
        createdAt: new Date().toISOString()
     };

     await databaseService.addUser(newUser);
     
     // 4. Mark code used (Optional - usually we toggle it off or log it)
     if (validCode) {
         // Optionally deactivate code here: await databaseService.toggleCode(validCode.id, true);
     }

     await databaseService.log(newUser.id, 'Register Google', `Joined via Google with code ${inviteCode || 'SYSTEM_INIT'}`);

     return newUser;
  },

  login: async (email: string, password: string): Promise<User> => {
    if (!firebaseAuth || !firebaseDb) throw new Error("Firebase not initialized. Check configuration.");

    const emailToUse = email.includes('@') ? email : `${email}@fc26pro.com`;
    
    const credential = await signInWithEmailAndPassword(firebaseAuth, emailToUse, password);
    const userDocRef = doc(firebaseDb, "users", credential.user.uid);
    const userDoc = await getDoc(userDocRef);
    
    if (userDoc.exists()) {
      return userDoc.data() as User;
    } else {
      // RECOVERY LOGIC: Profile missing but Auth valid. Recreate profile.
      console.warn("User authenticated but profile missing. Attempting recovery...");
      
      // Extract username from email
      const emailPart = credential.user.email?.split('@')[0] || 'unknown';
      const username = emailPart; 

      const allUsers = await databaseService.getUsers();
      const isAdmin = username.toLowerCase() === 'admin' || allUsers.length === 0;

      const newUser: User = {
        id: credential.user.uid,
        username: username,
        role: isAdmin ? UserRole.ADMIN : UserRole.MEMBER,
        createdAt: new Date().toISOString()
      };

      await databaseService.addUser(newUser);
      await databaseService.log(newUser.id, 'Profile Recovery', `Auto-recovered missing profile for ${username}`);
      
      return newUser;
    }
  },

  register: async (username: string, password: string, inviteCode: string): Promise<User> => {
    if (!firebaseAuth || !firebaseDb) throw new Error("Firebase not initialized. Check configuration.");

    const existingUsers = await databaseService.getUsers();

    if (existingUsers.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        throw new Error(`Username '${username}' is already taken. Please sign in.`);
    }
    
    const hasAdmin = existingUsers.some(u => u.role === UserRole.ADMIN);
    const isReservedSuperUser = username.toLowerCase() === 'admin';
    const canRegisterAsAdmin = existingUsers.length === 0 || !hasAdmin || isReservedSuperUser;

    if (!canRegisterAsAdmin) {
        if (!inviteCode) throw new Error('System initialized. Invitation code required.');
        const codes = await databaseService.getCodes();
        const validCode = codes.find(c => c.code === inviteCode && c.isActive);
        if (!validCode) throw new Error('Invalid or inactive invitation code.');
    }
    
    const email = `${username}@fc26pro.com`; 
    const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);

    const newUser: User = {
      id: credential.user.uid,
      username,
      role: canRegisterAsAdmin ? UserRole.ADMIN : UserRole.MEMBER,
      createdAt: new Date().toISOString(),
    };

    await databaseService.addUser(newUser);
    
    const logMsg = canRegisterAsAdmin 
        ? `User ${username} registered as System Admin (Privileged Access).` 
        : `User ${username} joined with code ${inviteCode}`;
        
    await databaseService.log(newUser.id, 'Register', logMsg);
    
    return newUser;
  },

  logout: async () => {
    if (firebaseAuth) {
        await signOut(firebaseAuth);
    }
  }
};
