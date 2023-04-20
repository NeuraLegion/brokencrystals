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

  const usefulLinks = [
    { name: 'Home', url: '/', icon: 'bx-chevron-right' },
    { name: 'About us', url: '/', icon: 'bx-chevron-right' },
    { name: 'Services', url: '/', icon: 'bx-chevron-right' },
    {
      name: 'Terms of service',
      url: '/api/goto?url=http://google.com',
      icon: 'bx-chevron-right'
    },
    {
      name: 'Privacy policy',
      url: 'https://takemeover-bright.s3.amazonaws.com/privacy-policy.pdf',
      icon: 'bx-chevron-right'
    }
  ];

  const services = [
    { name: 'Web Design', url: '/', icon: 'bx-chevron-right' },
    { name: 'Web Development', url: '/', icon: 'bx-chevron-right' },
    { name: 'Product Management', url: '/', icon: 'bx-chevron-right' },
    { name: 'Marketing', url: '/', icon: 'bx-chevron-right' },
    { name: 'Graphic Design', url: '/', icon: 'bx-chevron-right' }
  ];

  const footerLinkSections = [
    { title: 'Useful Links', items: usefulLinks },
    { title: 'Our Services', items: services }
  ];

  const socialMedia = [
    { name: 'twitter', url: '/', icon: 'bxl-twitter' },
    { name: 'facebook', url: '/', icon: 'bxl-facebook' },
    { name: 'instagram', url: '/', icon: 'bxl-instagram' },
    { name: 'google-plus', url: '/', icon: 'bxl-google-plus' },
    { name: 'linkedIn', url: '/', icon: 'bxl-linkedin' }
  ];

  const cloudProviders = [
    { name: 'google', url: `/api/file/google?path=google`, icon: 'bxl-google' },
    { name: 'aws', url: '/api/file/aws?path=aws', icon: 'bxl-amazon' },
    { name: 'azure', url: '/api/file/azure?path=azure', icon: 'bxl-microsoft' },
    {
      name: 'digital_ocean',
      url: '/api/file/digital_ocean?path=digital_ocean',
      icon: 'bxl-digitalocean'
    }
  ];

  const socialSections = [
    { title: 'Find us on', items: socialMedia },
    { title: 'Supporting', items: cloudProviders }
  ];

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

            {footerLinkSections.map((section, idx) => (
              <div
                className="col-lg-2 col-md-6 footer-links"
                key={`footer-links-section-${idx}`}
              >
                <h4>{section.title}</h4>
                <ul>
                  {section.items.map((item, idx) => (
                    <li key={`${section.title}-item-${idx}`}>
                      <i className={`bx ${item.icon}`} />{' '}
                      <a href={item.url}>{item.name}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

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
          <table>
            <tbody>
              {socialSections.map((section, idx) => (
                <tr key={`social-section-${idx}`}>
                  <td>{`${section.title}: `}</td>
                  <td>
                    <div className="px-1 d-flex flex-row align-items-start social-links text-center text-md-right pt-3 pt-md-0">
                      {section.items.map((item, idx) => (
                        <a href={item.url} key={`${section.title}-item-${idx}`}>
                          <i className={`bx ${item.icon}`} />
                        </a>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
