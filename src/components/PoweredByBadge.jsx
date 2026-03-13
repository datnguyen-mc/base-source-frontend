import React from 'react';
import { useAuth } from '@/lib/useAuth';

const PoweredByBadge = () => {
    const { projectInfo } = useAuth();

    if (!projectInfo?.package?.isFree) {
        return null;
    }

    return (
        <a
            href="https://vibe-x.app"
            target="_blank"
            rel="noopener noreferrer"
            style={{
                position: 'fixed',
                bottom: '16px',
                right: '16px',
                zIndex: 9999,
                background: 'rgba(0, 0, 0, 0.75)',
                color: '#fff',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
                textDecoration: 'none',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                transition: 'opacity 0.2s',
            }}
        >
            ⚡ Powered by vibeX
        </a>
    );
};

export default PoweredByBadge;
