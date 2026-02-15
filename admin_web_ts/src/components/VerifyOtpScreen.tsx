type Props = {
  phone: string;
  otp: string;
  token: string;
  authHint: string;
  authMessage: string;
  isAdmin: boolean;
  onPhoneChange: (value: string) => void;
  onOtpChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onVerifyOtp: (event: React.FormEvent) => Promise<void>;
  onBackToLogin: () => void;
};

export default function VerifyOtpScreen({
  phone,
  otp,
  token,
  authHint,
  authMessage,
  isAdmin,
  onPhoneChange,
  onOtpChange,
  onTokenChange,
  onVerifyOtp,
  onBackToLogin,
}: Props) {
  return (
    <section className="card">
      <h2>Verify OTP</h2>
      <p className="hint">{authHint}</p>

      <form onSubmit={onVerifyOtp} className="grid">
        <label>
          Phone (+2519xxxxxxxx)
          <input
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="+2519xxxxxxxx"
          />
        </label>
        <label>
          OTP Code
          <input value={otp} onChange={(e) => onOtpChange(e.target.value)} placeholder="123456" />
        </label>
        <button type="submit">Verify OTP</button>
      </form>

      <label>
        Or paste Access Token
        <textarea
          rows={3}
          value={token}
          onChange={(e) => onTokenChange(e.target.value)}
          placeholder="Paste admin access token"
        />
      </label>
      <div className="actions">
        <button className="secondary" type="button" onClick={onBackToLogin}>
          Back to Login
        </button>
      </div>

      {authMessage ? <p className="status">{authMessage}</p> : null}
      {!isAdmin && token ? <p className="status error">Current user is not ADMIN.</p> : null}
    </section>
  );
}
