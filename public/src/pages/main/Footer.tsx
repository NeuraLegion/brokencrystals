import React, { FC, FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import InnerHTML from 'dangerously-set-html-content';
import { postRender, postSubscriptions } from '../../api/httpClient';

export const Footer: FC = () => {
  const [subscriptions, setSubscriptions] = useState<string>('');
  const [subscriptionsResponse, setSubscriptionsResponse] = useState<any>();

  const [phone, setPhone] = useState<string>('');

  useEffect(() => {
    postRender('{{="+1"}} {{=5589}} {{=55488}} {{=55}}').then((data) =>
      setPhone(data)
    );
  }, []);

  const onInput = ({ target }: { target: EventTarget | null }) => {
    const { value } = target as HTMLInputElement;
    setSubscriptions(value);
  };

  const sendSubscription = (e: FormEvent) => {
    e.preventDefault();

    postSubscriptions(subscriptions).then((data) =>
      setSubscriptionsResponse(data)
    );
  };

  return (
    <footer id="footer">
      <div className="footer-top">
        <div className="container">
          <div className="row">
            <div className="col-lg-3 col-md-6 footer-contact">
              <Link to="/" className="logo mr-auto">
                <img
                  width={100}
                  height={100}
                  src="assets/img/logo.png"
                  alt=""
                  className="img-fluid"
                />
              </Link>
              <h3>BROKEN CRYSTALS</h3>

              <div>
                A108 Adam Street <br />
                New York, NY 535022
                <br />
                United States <br />
                <br />
                <strong>Phone:</strong>{' '}
                {phone && (
                  <span className="dangerous-html">
                    <InnerHTML html={phone} />
                  </span>
                )}
                <br />
                <strong>Email:</strong> info@example.com
                <br />
              </div>
            </div>

            <div className="col-lg-2 col-md-6 footer-links">
              <h4>Useful Links</h4>
              <ul>
                <li>
                  <i className="bx bx-chevron-right" /> <a href="/">Home</a>
                </li>
                <li>
                  <i className="bx bx-chevron-right" /> <a href="/">About us</a>
                </li>
                <li>
                  <i className="bx bx-chevron-right" /> <a href="/">Services</a>
                </li>
                <li>
                  <i className="bx bx-chevron-right" />{' '}
                  <a href="/api/goto?url=http://google.com">Terms of service</a>
                </li>
                <li>
                  <i className="bx bx-chevron-right" />{' '}
                  <a href="/">Privacy policy</a>
                </li>
              </ul>
            </div>

            <div className="col-lg-3 col-md-6 footer-links">
              <h4>Our Services</h4>
              <ul>
                <li>
                  <i className="bx bx-chevron-right" />{' '}
                  <a href="/">Web Design</a>
                </li>
                <li>
                  <i className="bx bx-chevron-right" />{' '}
                  <a href="/">Web Development</a>
                </li>
                <li>
                  <i className="bx bx-chevron-right" />{' '}
                  <a href="/">Product Management</a>
                </li>
                <li>
                  <i className="bx bx-chevron-right" />{' '}
                  <a href="/">Marketing</a>
                </li>
                <li>
                  <i className="bx bx-chevron-right" />{' '}
                  <a href="/">Graphic Design</a>
                </li>
              </ul>
            </div>

            <div className="col-lg-4 col-md-6 footer-newsletter">
              <h4>Join Our Newsletter</h4>
              <p>
                Tamen quem nulla quae legam multos aute sint culpa legam noster
                magna
              </p>
              <form onSubmit={sendSubscription}>
                <input
                  type="input"
                  name="input"
                  value={subscriptions}
                  onInput={onInput}
                />
                <input type="submit" value="Subscribe" />
              </form>
              {subscriptionsResponse && (
                <div className="dangerous-html">
                  <InnerHTML html={subscriptionsResponse + ' subscribed.'} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="copyright-wrap d-md-flex py-4">
          <div className="mr-md-auto text-center text-md-left">
            <div className="copyright">
              &copy; Copyright{' '}
              <strong>
                <span>Broken Crystals</span>
              </strong>
              . All Rights Reserved
            </div>
            <span className="dangerous-html">
              <InnerHTML html={decodeURIComponent(window.location.search)} />
            </span>
          </div>
          <div className="social-links text-center text-md-right pt-3 pt-md-0">
            <a href="/" className="twitter">
              <i className="bx bxl-twitter" />
            </a>
            <a href="/" className="facebook">
              <i className="bx bxl-facebook" />
            </a>
            <a href="/" className="instagram">
              <i className="bx bxl-instagram" />
            </a>
            <a href="/" className="google-plus">
              <i className="bx bxl-skype" />
            </a>
            <a href="/" className="linkedin">
              <i className="bx bxl-linkedin" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
