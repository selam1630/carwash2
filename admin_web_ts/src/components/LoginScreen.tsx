type Props = {
  phone: string;
  authMessage: string;
  onPhoneChange: (value: string) => void;
  onSendOtp: (event: React.FormEvent) => Promise<void>;
  onBack: () => void;
};

export default function LoginScreen({
  phone,
  authMessage,
  onPhoneChange,
  onSendOtp,
  onBack,
}: Props) {
  return (
    <section className="card">
      <h2>Admin Login</h2>
      <p className="hint">Enter admin phone and send OTP.</p>

      <form onSubmit={onSendOtp} className="grid">
        <label>
          Admin Phone (+2519xxxxxxxx)
          <input
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="+2519xxxxxxxx"
          />
        </label>
        <button type="submit">Send OTP</button>
      </form>

      <div className="actions">
        <button className="secondary" type="button" onClick={onBack}>
          Back
        </button>
      </div>

      {authMessage ? <p className="status">{authMessage}</p> : null}
    </section>
  );
}
