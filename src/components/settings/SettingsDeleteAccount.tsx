export default function SettingsDeleteAccount() {
  return (
    <div className="p-6 border border-destructive/30 rounded-lg">
      <h3 className="font-semibold text-destructive">Delete Account</h3>
      <p className="text-sm text-muted-foreground mt-2">
        Permanently delete your account and all associated data.
        This action cannot be undone.
      </p>
      <button
        disabled
        className="mt-4 px-4 py-2 border border-destructive/30 text-destructive rounded opacity-50 cursor-not-allowed"
      >
        Coming soon
      </button>
    </div>
  );
}
