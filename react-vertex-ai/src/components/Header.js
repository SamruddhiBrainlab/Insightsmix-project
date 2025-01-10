import React from 'react';
import { AppBar, Toolbar, Typography, Box, Divider, styled } from '@mui/material';

// Styled components for custom styling
const StyledAppBar = styled(AppBar)(() => ({
  backgroundColor: 'white',
  boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.1)',
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '60px',
  zIndex: 1000,
}));

const LogoImage = styled('img')({
  height: '50px',
  width: 'auto',
  marginRight: '15px',
});

const StyledDivider = styled(Divider)({
  height: '40px',
  margin: '0 15px',
  borderColor: 'rgba(0, 0, 0, 0.1)',
});

const StyledTitle = styled(Typography)({
  fontSize: '1.2rem',
  fontWeight: 'bold',
  fontStyle: 'italic',
  marginLeft: '10px',
  color: '#000000',
});

const UserProfile = styled(Box)({
  display: 'flex',
  alignItems: 'center',
});

const Header = ({ user }) => {
  return (
    <StyledAppBar color="transparent">
      <Toolbar>
        <Box display="flex" alignItems="center" flexGrow={1}>
          <LogoImage src="/brainlab_logo.webp" alt="Brainlab Logo" />
          <StyledDivider orientation="vertical" flexItem />
          <LogoImage src="/login.png" alt="Login Logo" />
          <StyledTitle variant="h6" color="primary">
            InsightsMix
          </StyledTitle>
        </Box>

        {/* User Profile Section */}
        {user ? (
          <UserProfile>
            <img
              src={user.picture} // Use picture from user object
              alt={user.name}
              style={{ width: '40px', height: '40px', borderRadius: '50%' }}
            />
            <Typography variant="body1" style={{ marginLeft: '10px' }}>
              {user.name} {/* Display user's name */}
            </Typography>
          </UserProfile>
        ) : null} {/* Don't show anything if the user is not logged in */}
      </Toolbar>
    </StyledAppBar>
  );
};

export default Header;
