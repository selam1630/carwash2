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
    <section className="auth-shell auth-shell-login">
      <article className="auth-intro auth-intro-login auth-intro-landing">
        <div className="auth-brand-row">
          <span className="lp-brand-mark">CW</span>
          <strong>CarWash Pro</strong>
        </div>
        <p className="hero-eyebrow">Admin Access</p>
        <h2>Login to Manage Your Car Wash Operations</h2>
        <p className="auth-copy">Secure OTP login for live wash requests, bikers, and plans.</p>
        <div className="auth-image-frame">
          <img src="/assets/images/wash-car.png" alt="Car wash service" />
        </div>
      </article>

      <article className="card auth-card auth-card-elevated">
        <div className="auth-card-head">
          <p className="auth-kicker">Step 1</p>
          <h3>Send Login OTP</h3>
          <p className="hint">Use your registered admin number.</p>
        </div>

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
        <p className="muted small auth-foot-note">After OTP is sent, continue to verification screen.</p>
      </article>
    </section>
  );
}
