# Finger Tune

## Inspiration
The idea for FingerTune was sparked by the intersection of music and intuitive technology. We wanted to create an app that makes music creation accessible and fun for everyone, regardless of musical background. The concept of using hand movements to produce sounds intrigued us because it adds a tactile and interactive element to the experience, transforming the user into an active participant in music creation. Our goal was to break down traditional barriers to music-making, combining the playfulness of games with the creative freedom of music generation.

## What it does
FingerTune is an app that allows users to generate music by simply moving their hands. By leveraging hand detection technology and other sound generator libraries, the app tracks hand movements and translates them into musical notes or sounds, creating a fun and interactive way to compose music. Along with music generation, FingerTune features two mini-games that engage users in fun activities while they learn more about rhythm and melody. The app aims to merge entertainment with education, making music exploration enjoyable and accessible for all ages.

## How we built it
We used a combination of technologies to bring FingerTune to life. The core functionality was built around hand detection, which tracks and interprets hand movements via the webcam. This data is processed in real-time to generate corresponding sounds. For sound generation, we utilized a sound library that allowed us to map different values that were converted from hand movements to specific instruments or notes. The games were built based on the work of our core feature, which also integrates webcam, hand detections, and other functions to generate music note tiles.

## Challenges we ran into
One of the challenges was getting the hand movements to translate smoothly into sound. Initially, there was a noticeable lag between gesture input and sound output, which impacted the user experience. We spent time refining the gesture recognition algorithm to make it more accurate and responsive. Another challenge was creating an intuitive mapping of hand movements to different sounds, so users could naturally interact with the app without feeling like they had to learn complex gestures. Finding the right balance between fun and usability was key, especially when integrating the two games with the music generator.

## Accomplishments that we're proud of
We’re particularly proud of developing an app that successfully combines a music generator with two interactive games in a single platform. The ability to create music using hand movements is a fun innovation, and we’re thrilled that we could enhance the experience with game-based learning.

## What we learned
Throughout this project, we gained a deeper understanding of hand detection and hand movements to sound transformation. We learned how to integrate multiple technologies into a single platform without sacrificing performance.

## What's next for FingerTune
Moving forward, we plan to add more instruments and expand the types of sounds users can create with their hand movements. We also want to introduce additional games that offer more interactive ways to engage with music, ensuring that FingerTune remains fresh and fun. One of our more ambitious goals is to integrate an AI model that can analyze user inputs and generate more complex music based on their gestures. This would allow users to create dynamic, evolving compositions that go beyond simple note generation, elevating the creative potential of the app.
