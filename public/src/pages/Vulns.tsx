import React, { FC } from "react";

export const Vulns: FC = () => {
  function repeatItems(count: number) {
    return Array.from({ length: count }, (v, k) => k + 1);
  }

  return (
    <div className="container">
      <h1>
        Have fun and keep <s>un</s>safe!
      </h1>

      <ul className="collection">
        <li>
          <a className="collection-item" href="/vuln/headers">
            Check your headers!
          </a>
        </li>
        <li>
          <a className="collection-item" href="/vuln/greeter">
            Let's get to know you a bit more :)
          </a>
        </li>
        <li>
          <a className="collection-item" href="/vuln/cookies">
            Cookies? Yum!
          </a>
        </li>
        <li>
          <a className="collection-item" href="/vuln/oops">
            Don't click this link, still working on that
          </a>
        </li>
        <li>
          <a
            className="collection-item"
            href="/vuln/picture?url=https://www.neuralegion.com/wp-content/themes/Neural/assets/images/NeuraLegionLogoAlt.png"
          >
            Get me a cool picture!
          </a>
        </li>
        <li>
          <a
            className="collection-item"
            href="/vuln/redirect?url=https://www.neuralegion.com/"
          >
            Come say hello to our website!
          </a>
        </li>

        {repeatItems(4).map((item) => (
          <li>
            <a
              className="collection-item"
              href={`/vuln/uptime/${item}?command=uptime`}
            >
              #{item} What's our uptime?
            </a>
          </li>
        ))}

        {repeatItems(6).map((item) => (
          <li>
            <a
              className="collection-item"
              href={`/vuln/xss/${item}?id=${item}`}
            >
              XSS {item}
            </a>
          </li>
        ))}

        <li>
          <a className="collection-item" href="/vuln/pxss">
            pXSS One
          </a>
        </li>

        {repeatItems(2).map((item) => (
          <li>
            <a className="collection-item" href={`/vuln/dom_xss/${item}`}>
              DOM XSS {item}
            </a>
          </li>
        ))}

        {repeatItems(2).map((item) => (
          <li>
            <a
              className="collection-item"
              href={`/vuln/lfi/${item}?image=crystals_1.jpg`}
            >
              LFI {item}
            </a>
          </li>
        ))}

        <li>
          <a className="collection-item" href="/vuln/csrf">
            CSRF
          </a>
        </li>
      </ul>
    </div>
  );
};

export default Vulns;
