import React, { useState } from 'react';
import { 
  AppBar, 
  Toolbar, 
  Typography, 
  Box, 
  Divider, 
  styled,
  Menu,
  MenuItem,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import ProfileImage from './ProfileImage';

// Styled components remain the same...
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
  marginBottom: "8px"
});

const StyledDivider = styled(Divider)({
  height: '40px',
  margin: '0 15px',
  borderColor: 'rgba(0, 0, 0, 0.1)',
});

const StyledTitle = styled(Typography)({
  fontSize: '1.5rem',
  fontWeight: 'bold',
  fontStyle: 'italic',
  marginLeft: '10px',
  color: '#333333',
});

const UserProfile = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
  '&:hover': {
    opacity: 0.8,
  },
});

const UserName = styled(Typography)({
  marginLeft: '10px',
  marginRight: '5px',
  fontSize: 'small',
  color: '#333333',
});

const Header = ({ selectedProject, setUser }) => {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState(null);
  const user = localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user")) : null;

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    handleMenuClose();
    localStorage.clear();
    setUser(null); // Update the app state
    navigate('/login', { replace: true });
  };
  
  return (
    <StyledAppBar color="transparent">
      <Toolbar>
        <Box display="flex" alignItems="center" flexGrow={1}>
          <LogoImage src="/brainlab_logo.png" alt="Brainlab Logo" />
          <StyledDivider orientation="vertical" flexItem />
          <LogoImage src="/login.png" alt="Login Logo" />
          <StyledTitle variant="h6" color="primary">
            InsightsMix
          </StyledTitle>
        </Box>

        {/* User Profile Section with Dropdown */}
        {user && (
          <>
            <UserProfile onClick={handleMenuOpen}>
              <UserName variant="body1">
                {user.name}
              </UserName>
              <ProfileImage
                src={user.picture}
                alt={user.name}
              />
            </UserProfile>

            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              PaperProps={{
                elevation: 3,
                sx: {
                  mt: 1.5,
                  '& .MuiMenuItem-root': {
                    px: 2,
                    py: 1,
                    fontSize: '0.875rem',
                  },
                },
              }}
            >
              <MenuItem onClick={handleLogout}>
                Logout
              </MenuItem>
            </Menu>
          </>
        )}
      </Toolbar>
    </StyledAppBar>
  );
};

export default Header;