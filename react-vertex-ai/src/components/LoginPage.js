import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import './Login.css'; // Importing the CSS file
import Header from './Header';

const clientId = "";

function Login() {
  const navigate = useNavigate(); // Use navigate hook
  const [user, setUser] = useState(null); // Add state to store user information

  const onSuccess = (credentialResponse) => {
    console.log('Login Success:', credentialResponse);
    // Decode the credential response to get the user data
    const userData = credentialResponse.credential ? JSON.parse(atob(credentialResponse.credential.split('.')[1])) : null;
    if (userData) {
      setUser(userData); // Store the user info in the state
    }
    alert('Logged in successfully!');
    navigate('/dashboard'); // Navigate to the dashboard after login success
  };

  const onError = () => {
    console.error('Login Failed');
    alert('Failed to login. Please try again.');
  };

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <div className="login-container">
        <Header user={user} /> {/* Pass user data to the Header */}
        <main className="login-main">
          <h2 className="login-heading">InsightsMix</h2>
          <p className="login-subheading">
            Log in with your Google account to begin.
          </p>
          <GoogleLogin onSuccess={onSuccess} onError={onError} />
        </main>
      </div>
    </GoogleOAuthProvider>
  );
}

export default Login;
