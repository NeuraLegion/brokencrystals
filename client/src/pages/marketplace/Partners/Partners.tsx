import React, { FC, useEffect, useState } from 'react';
import { DOMParser } from 'xmldom';

import OwlCarousel from 'react-owl-carousel';
import 'owl.carousel/dist/assets/owl.carousel.css';
import 'owl.carousel/dist/assets/owl.theme.default.css';

import { searchPartners, partnerLogin } from '../../../api/httpClient';
import { Partner } from '../../../interfaces/Partner';

export const Partners: FC = () => {
  const PARTNER_DEFAULT_USERNAME = 'walter100';
  const PARTNER_DEFAULT_PASSWORD = 'Heisenberg123';

  const [partners, setPartners] = useState<Array<Partner>>([]);

  const fetchPartners = () => {
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
        const photoUrl = `assets/img/partners/${name
          .toLowerCase()
          .replace(' ', '-')}.jpg`;
        partnersList.push({ name: name, photoUrl: photoUrl });
      }

      setPartners(partnersList);
    });
  };

  const loginPartner = () => {
    // XPATH injection boolean detection
    partnerLogin(PARTNER_DEFAULT_USERNAME, PARTNER_DEFAULT_PASSWORD).then(
      (data) => {
        const xmlDoc = new DOMParser().parseFromString(data, 'text/xml');

        if (!xmlDoc) {
          console.log(`Partner login as '${PARTNER_DEFAULT_USERNAME}' failed`);
          return;
        }

        console.log(`Partner login as '${PARTNER_DEFAULT_USERNAME}' succeded!`);
      }
    );
  };

  useEffect(() => {
    fetchPartners();
    loginPartner();
  }, [partners.length]);

  const generatePartnerItem = (partner: Partner, idx: number) => (
    <div className="partner-item" key={partner.name + idx}>
      <h4 className="partner-name">{partner.name}</h4>
      <img src={partner.photoUrl} className="partner-img" alt="" />
    </div>
  );

  return (
    <section id="partners" className="testimonials section-bg">
      <div className="container" data-aos="fade-up">
        <div className="section-title">
          <h2>Our Partners</h2>
        </div>

        <div id="parnters-names-list">
          {partners ? (
            <OwlCarousel
              className="owl-carousel"
              items={partners.length}
              loop={false}
            >
              {partners.map((partner, idx) =>
                generatePartnerItem(partner, idx)
              )}
            </OwlCarousel>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default Partners;
