import React, { FC, useEffect, useState } from 'react';
import { DOMParser } from 'xmldom';

import OwlCarousel from 'react-owl-carousel';
import 'owl.carousel/dist/assets/owl.carousel.css';
import 'owl.carousel/dist/assets/owl.theme.default.css';

import { searchPartners, partnerLogin } from '../../../api/httpClient';
import { Partner } from '../../../interfaces/Partner';
import PartnersItems from './PartnersItems';

export const Partners: FC = () => {
  const PARTNER_DEFAULT_USERNAME: string = 'walter100';
  const PARTNER_DEFAULT_PASSWORD: string = 'Heisenberg123';

  const [partners, setPartners] = useState<Array<Partner>>([]);

  const partnerNameSearchEP = () => {
    // XPATH injection string detection
    searchPartners('').then((data) => {
      const partnersList: Array<Partner> = [];

      const xmlDoc = new DOMParser().parseFromString(data, 'text/xml');

      if (!xmlDoc) {
        partnersList.push({ name: 'Failed loading name', photoUrl: '' });
        setPartners(partnersList);
        return;
      }

      const partnerNameTags = xmlDoc.getElementsByTagName('name');

      for (const nameTag of Array.from(partnerNameTags)) {
        const name = nameTag.textContent || 'Error in loading name';
        const photoUrl =
          'assets/img/partners/' +
          name.toLowerCase().replace(' ', '-') +
          '.jpg';
        partnersList.push({ name: name, photoUrl: photoUrl });
      }

      setPartners(partnersList);
    });
  };

  const partnerLoginEP = () => {
    // XPATH injection boolean detection
    partnerLogin(PARTNER_DEFAULT_USERNAME, PARTNER_DEFAULT_PASSWORD).then(
      (data) => {
        const xmlDoc = new DOMParser().parseFromString(data, 'text/xml');

        if (!xmlDoc) {
          console.log("Partner login for username 'walter100' failed");
          return;
        }

        console.log("Partner login for username 'walter100' was successful!");
      }
    );
  };

  useEffect(() => {
    partnerNameSearchEP();
    partnerLoginEP();
  }, []);

  return (
    <section id="partners" className="testimonials section-bg">
      <div className="container" data-aos="fade-up">
        <div className="section-title">
          <h2>Our Partners</h2>
        </div>

        <div id="parnters-names-list">
          {partners?.length ? (
            <OwlCarousel className="owl-carousel" dots items={3} loop={false}>
              <PartnersItems partners={partners} />
            </OwlCarousel>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default Partners;
