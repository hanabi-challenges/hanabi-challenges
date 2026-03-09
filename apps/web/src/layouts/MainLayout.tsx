import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Button,
  Inline,
  MaterialIcon,
  PageContainer,
  Tabs,
  Text,
  Main,
  CoreBox as Box,
} from '../design-system';
import { UserPill } from '../features/users/UserPill';
import { useNotificationsFeed } from '../features/notifications/useNotifications';
import { NotificationsBellMenu } from '../features/notifications/NotificationsBellMenu';
import './MainLayout.css';

export const MainLayout: React.FC = () => {
  const { user, token, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const {
    notifications,
    unreadCount,
    menuOpen,
    setMenuOpen,
    handleNotificationClick,
    handleMarkAllRead,
  } = useNotificationsFeed({
    token,
    userId: user?.id ?? null,
    onNavigate: (destination) => navigate(destination),
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    root.setAttribute('data-mantine-color-scheme', isDark ? 'dark' : 'light');
    document.body.classList.toggle('dark', isDark);
  }, [isDark]);

  const links = [
    { to: '/', label: 'Home', end: true },
    { to: '/events', label: 'Events' },
    { to: '/about', label: 'About' },
    {
      to: '/admin',
      label: 'Admin',
      show: !!user && (user.role === 'ADMIN' || user.role === 'SUPERADMIN'),
    },
  ];

  return (
    <Box className="app-root">
      <Box component="header" className="main-layout__header">
        <PageContainer>
          <Box className="main-layout__nav">
            <Inline gap="sm" justify="space-between" align="center" wrap style={{ width: '100%' }}>
              <Tabs
                items={links
                  .filter((l) => l.show ?? true)
                  .map((link) => ({
                    key: link.to,
                    label: link.label,
                    active: link.end
                      ? location.pathname === link.to
                      : location.pathname.startsWith(link.to),
                    onSelect: () => navigate(link.to),
                  }))}
              />
              <Inline className="main-layout__actions" gap="sm" align="center" justify="end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsDark((v) => !v)}
                  aria-label="Toggle theme"
                >
                  <MaterialIcon name="contrast" />
                </Button>

                {user ? (
                  <>
                    <NotificationsBellMenu
                      notifications={notifications}
                      unreadCount={unreadCount}
                      menuOpen={menuOpen}
                      setMenuOpen={setMenuOpen}
                      onNotificationClick={(notification) =>
                        void handleNotificationClick(notification)
                      }
                      onMarkAllRead={() => void handleMarkAllRead()}
                    />

                    <UserPill
                      as={Link}
                      to="/me"
                      name={user.display_name}
                      color={user.color_hex}
                      textColor={user.text_color}
                      size="md"
                      className="main-layout__user-pill"
                    />

                    <Button variant="secondary" size="md" onClick={() => logout()}>
                      Log out
                    </Button>
                  </>
                ) : (
                  <Button as={Link} to="/login" variant="primary" size="md">
                    Log in
                  </Button>
                )}
              </Inline>
            </Inline>
          </Box>
        </PageContainer>
      </Box>

      <Main className="main-layout__main">
        <PageContainer>
          <Outlet />
        </PageContainer>
      </Main>

      <Box component="footer" className="main-layout__footer">
        <PageContainer>
          <Box className="main-layout__footer-grid">
            <Box className="main-layout__footer-block">
              <Link className="main-layout__footer-link" to="/about">
                About
              </Link>
              <Link className="main-layout__footer-link" to="/about/FAQ">
                FAQ
              </Link>
            </Box>

            <Box className="main-layout__footer-block">
              <Link className="main-layout__footer-link" to="/contact">
                Contact
              </Link>
              <Link className="main-layout__footer-link" to="/feedback">
                Feedback
              </Link>
              <Link className="main-layout__footer-link" to="/code-of-conduct">
                Code of Conduct
              </Link>
            </Box>

            <Box className="main-layout__footer-block">
              <Link className="main-layout__footer-link" to="/legal/terms">
                Terms
              </Link>
              <Link className="main-layout__footer-link" to="/legal/privacy">
                Privacy
              </Link>
            </Box>
          </Box>

          <Box className="main-layout__trademark">
            <Text variant="muted" className="main-layout__footnote">
              © {new Date().getFullYear()} Hanabi Challenges
            </Text>
          </Box>
        </PageContainer>
      </Box>
    </Box>
  );
};
