import {
  CoreBox as Box,
  CoreIndicator as Indicator,
  CoreMenu as Menu,
  CoreScrollArea as ScrollArea,
  Stack as MStack,
  Text as MText,
  CoreUnstyledButton as UnstyledButton,
} from '../../design-system';
import { type UserNotification } from './notificationsApi';
import { notificationKey } from './useNotifications';
import { MaterialIcon } from '../../design-system';

type Props = {
  notifications: UserNotification[];
  unreadCount: number;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  onNotificationClick: (notification: UserNotification) => void;
  onMarkAllRead: () => void;
};

export function NotificationsBellMenu(props: Props) {
  const { notifications, unreadCount, menuOpen, setMenuOpen, onNotificationClick, onMarkAllRead } =
    props;

  return (
    <Menu opened={menuOpen} onChange={setMenuOpen} position="bottom-end" width={320}>
      <Menu.Target>
        <Indicator
          inline
          processing={unreadCount > 0}
          disabled={unreadCount === 0}
          label={unreadCount > 99 ? '99+' : unreadCount}
          size={16}
          color="red"
        >
          <UnstyledButton
            aria-label="Notifications"
            style={{
              width: 28,
              height: 28,
              display: 'grid',
              placeItems: 'center',
              color: 'var(--color-text)',
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
            }}
          >
            <MaterialIcon name="notifications" />
          </UnstyledButton>
        </Indicator>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Notifications</Menu.Label>
        <ScrollArea.Autosize mah={280} offsetScrollbars>
          <MStack gap={2} px={4} py={4}>
            {notifications.length === 0 ? (
              <MText size="sm" c="dimmed" px={8} py={4}>
                No notifications
              </MText>
            ) : (
              notifications.map((notification) => (
                <Menu.Item
                  key={notificationKey(notification)}
                  onClick={() => onNotificationClick(notification)}
                  rightSection={
                    notification.read_at ? null : (
                      <Box
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: 'var(--color-accent)',
                          display: 'inline-block',
                        }}
                      />
                    )
                  }
                >
                  <MStack gap={0}>
                    <MText size="sm" fw={600}>
                      {notification.title}
                    </MText>
                    <MText size="xs" c="dimmed" lineClamp={2}>
                      {notification.body}
                    </MText>
                  </MStack>
                </Menu.Item>
              ))
            )}
          </MStack>
        </ScrollArea.Autosize>
        <Menu.Divider />
        <Menu.Item disabled={unreadCount === 0} onClick={onMarkAllRead}>
          Mark all read
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
