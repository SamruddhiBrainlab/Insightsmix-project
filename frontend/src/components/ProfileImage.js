import React, { useState, useEffect } from 'react';
import { Avatar } from '@mui/material';
import { User } from 'lucide-react';
import { styled } from '@mui/material/styles';

const StyledAvatar = styled(Avatar)({
  width: 40,
  height: 40
});

const ProfileImage = ({ src, alt, className }) => {
  const [imageError, setImageError] = useState(false);
  const [imageSrc, setImageSrc] = useState(src);

  useEffect(() => {
    if (!src) {
      setImageError(true);
      return;
    }

    // Reset error state when src changes
    setImageError(false);
    setImageSrc(src);

    const img = new Image();
    
    img.onload = () => {
      setImageSrc(src);
      setImageError(false);
    };

    img.onerror = () => {
      const timestamp = new Date().getTime();
      const retryUrl = `${src}${src.includes('?') ? '&' : '?'}t=${timestamp}`;
      const retryImg = new Image();

      retryImg.onload = () => {
        setImageSrc(retryUrl);
        setImageError(false);
      };
      
      retryImg.onerror = () => {
        setImageError(true);
        console.warn('Image failed to load after retry:', src);
      };
      
      retryImg.src = retryUrl;
    };

    img.src = src;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  return (
    <StyledAvatar 
      className={className}
      sx={{
        bgcolor: imageError ? 'grey.200' : 'transparent',
        '& img': {
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }
      }}
    >
      {!imageError ? (
        <img
          src={imageSrc}
          alt={alt}
          onError={() => setImageError(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <User 
          size={24}
          style={{ color: '#666' }}
        />
      )}
    </StyledAvatar>
  );
};

export default ProfileImage;