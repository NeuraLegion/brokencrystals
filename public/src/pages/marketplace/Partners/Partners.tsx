import React, { FC, useEffect, useState } from 'react';
import { DOMParser } from 'xmldom';

import OwlCarousel from 'react-owl-carousel';
import 'owl.carousel/dist/assets/owl.carousel.css';
import 'owl.carousel/dist/assets/owl.theme.default.css';

import { searchPartners, partnerLogin } from '../../../api/httpClient';
import { Partner } from '../../../interfaces/Partner';
import PartnersItems from './PartnersItems';
import PartnerLoginForm from './PartnerLoginForm';

interface Props {
  preview: boolean;
}

export const Partners: FC<Props> = (props: Props) => {
  const [partners, setPartners] = useState<Array<Partner>>([]);

  useEffect(() => {
    searchPartners('').then((data) => {
      const xmlDoc = new DOMParser().parseFromString(data, 'text/xml');
      const nameListTags = xmlDoc.getElementsByTagName('name');

      const partnersList: Array<any> = [];
      for (let i = 0; i < nameListTags.length; i++) {
        const name = nameListTags[i].textContent || 'Error in loading name';
        const photoUrl =
          'assets/img/partners/' +
          name.toLowerCase().replace(' ', '-') +
          '.jpg';
        partnersList.push({ name: name, photoUrl: photoUrl });
      }

      setPartners(partnersList);
    });
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

      <div>{props.preview || <PartnerLoginForm />}</div>
    </section>
  );
};

export default Partners;
