import React from "react";
import { useNavigate } from "react-router-dom";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import "./Login.css";
import Header from "./Header";

const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

function Login({ setUser }) {
  const navigate = useNavigate();

  const onSuccess = (credentialResponse) => {
    const userData = credentialResponse.credential
      ? JSON.parse(atob(credentialResponse.credential.split(".")[1]))
      : null;
    if (userData) {
      setUser(userData);
      const saveUser = (userData) => {
        if (userData.picture && !userData.picture.startsWith('http')) {
          userData.picture = `${window.location.origin}${userData.picture}`;
        }
        localStorage.setItem('user', JSON.stringify(userData));
      };
    }
    console.log(localStorage.getItem('user'))
    navigate("/dashboard");
  };

  const onError = () => {
    alert("Failed to login. Please try again.");
  };

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <div className="login-container">
        <Header user={null} />
        <main className="login-main">
          <h2 className="login-heading">InsightsMix</h2>
          <p className="login-subheading">Log in with your Google account to begin.</p>
          <GoogleLogin onSuccess={onSuccess} onError={onError} />
        </main>
      </div>
    </GoogleOAuthProvider>
  );
}

export default Login;
