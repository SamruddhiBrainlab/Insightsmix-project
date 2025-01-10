// components/HomePage.js
import React from 'react';
import { Link } from 'react-router-dom';

function HomePage() {
  return (
    <div>
      <h1>Welcome to the InsightsMix</h1>
      <p>This is the homepage of your app.</p>
      <nav>
        <Link to="/login">Login</Link>
      </nav>
    </div>
  );
}

export default HomePage;
