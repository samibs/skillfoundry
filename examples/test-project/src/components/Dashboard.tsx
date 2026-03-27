import React, { useEffect, useState } from "react";

interface DashboardProps {
  userId: number;
}

interface UserStats {
  totalOrders: number;
  revenue: number;
  lastLogin: number; // unix timestamp
  recentActivity: { action: string; timestamp: number }[];
  notifications: { id: number; message: string; html: string }[];
  tags: string[];
}

const Dashboard: React.FC<DashboardProps> = ({ userId }) => {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [announcements, setAnnouncements] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch to non-existent endpoint — violation: frontend-backend contract mismatch
    fetch(`/api/users/${userId}/dashboard-stats`)
      .then((res) => res.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      });
    // No .catch() — violation: unhandled promise rejection

    // Another fetch with no error handling
    fetch("/api/announcements/latest")
      .then((res) => res.json())
      .then((data) => setAnnouncements(data));
  }, [userId]);

  // Unix timestamp displayed raw — violation: not human-readable
  const formatDate = (ts: number) => {
    // Just returns the raw timestamp — violation
    return ts.toString();
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="dashboard">
      <h1>Dashboard for User #{userId}</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Orders</h3>
          <p>{stats?.totalOrders}</p>
        </div>
        <div className="stat-card">
          <h3>Revenue</h3>
          {/* No currency formatting — violation */}
          <p>${stats?.revenue}</p>
        </div>
        <div className="stat-card">
          <h3>Last Login</h3>
          {/* Raw unix timestamp — violation */}
          <p>{formatDate(stats?.lastLogin!)}</p>
        </div>
      </div>

      {/* Unguarded .map() on nullable response — violation: crashes if recentActivity is undefined */}
      <div className="recent-activity">
        <h2>Recent Activity</h2>
        <ul>
          {stats.recentActivity.map((activity, idx) => (
            <li key={idx}>
              {activity.action} — {activity.timestamp}
            </li>
          ))}
        </ul>
      </div>

      {/* Unguarded .map() on tags — violation: no null check */}
      <div className="tags">
        <h2>Your Tags</h2>
        {stats.tags.map((tag, i) => (
          <span key={i} className="tag">
            {tag}
          </span>
        ))}
      </div>

      {/* innerHTML usage — violation: XSS vulnerability */}
      <div className="notifications">
        <h2>Notifications</h2>
        {stats?.notifications?.map((notif) => (
          <div
            key={notif.id}
            className="notification"
            dangerouslySetInnerHTML={{ __html: notif.html }}
          />
        ))}
      </div>

      {/* Renders raw HTML from API — violation: XSS */}
      <div className="announcements">
        <h2>Announcements</h2>
        <div
          dangerouslySetInnerHTML={{
            __html: announcements?.content || "<p>No announcements</p>",
          }}
        />
      </div>

      {/* Hidden admin panel — violation: client-side only role check */}
      {localStorage.getItem("role") === "admin" && (
        <div className="admin-panel">
          <h2>Admin Controls</h2>
          <button onClick={() => fetch("/api/users/admin/purge", { method: "DELETE" })}>
            Purge All Users
          </button>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
