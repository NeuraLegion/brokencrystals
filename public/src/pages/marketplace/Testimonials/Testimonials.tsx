import React, { FC, useEffect, useState } from 'react';
import { getTestimonials, getTestimonialsCount } from '../../../api/httpClient';
import { Testimonial } from '../../../interfaces/Testimonial';
import OwlCarousel from 'react-owl-carousel';
import 'owl.carousel/dist/assets/owl.carousel.css';
import 'owl.carousel/dist/assets/owl.theme.default.css';
import TestimonialsForm from './TestimonialsForm';
import TestimonialsItems from './TestimonialsItems';

interface Props {
  preview: boolean;
}

export const Testimonials: FC<Props> = (props: Props) => {
  const [testimonials, setTestimonials] = useState<Array<Testimonial>>([]);
  const [newTestimonial, setNewTestimonial] = useState<any>();
  const [testimonialsCount, setTestimonialsCount] = useState<number>(0);

  useEffect(() => {
    getTestimonials().then((data) => setTestimonials(data));
    getTestimonialsCount().then((data) => setTestimonialsCount(data));
  }, []);

  useEffect(() => {
    if (newTestimonial) {
      getTestimonials().then((data) => setTestimonials(data));
      getTestimonialsCount().then((data) => setTestimonialsCount(data));
      return () => setTestimonials([]);
    }
  }, [newTestimonial]);

  return (
    <section id="testimonials" className="testimonials section-bg">
      <div className="container" data-aos="fade-up">
        <div className="section-title">
          <h2>Testimonials ({testimonialsCount})</h2>
          <p>
            Magnam dolores commodi suscipit. Necessitatibus eius consequatur ex
            aliquid fuga eum quidem. Sit sint consectetur velit. Quisquam quos
            quisquam cupiditate. Et nemo qui impedit suscipit alias ea. Quia
            fugiat sit in iste officiis commodi quidem hic quas.
          </p>
        </div>

        {testimonials?.length ? (
          <OwlCarousel className="owl-carousel" dots items={3} loop={false}>
            <TestimonialsItems testimonials={testimonials} />
          </OwlCarousel>
        ) : null}
      </div>

      {props.preview || (
        <TestimonialsForm setNewTestimonial={setNewTestimonial} />
      )}
    </section>
  );
};

export default Testimonials;
