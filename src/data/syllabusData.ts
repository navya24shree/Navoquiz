import { TaxonomyItem } from '../types';

export interface SubjectSyllabus {
  name: string;
  code: string;
  questionCount: number;
  icon: string;
  topics: {
    name: string;
    subtopics: string[];
  }[];
}

export const SYLLABUS_DATA: SubjectSyllabus[] = [
  {
    name: 'Environmental Studies (EVS)',
    code: 'EVS',
    questionCount: 20,
    icon: 'eco',
    topics: [
      {
        name: 'The Natural World',
        subtopics: [
          'Transportation',
          'Rivers',
          'Mountains',
          'Plants',
          'Animals on Land and in Water',
          'Natural Disasters',
          'Types of Houses and Shelters',
          'Water Cycle',
        ],
      },
      {
        name: 'The Human Body',
        subtopics: [
          'Food and Nutrients',
          'Hygiene and Cleanliness',
          'Super Senses',
          'Basic Knowledge of the Digestive System',
          'Basic Knowledge of the Circulatory System',
          'Basic Knowledge of the Respiratory System',
        ],
      },
      {
        name: 'Science in Daily Life',
        subtopics: [
          'Food Preservation',
          'Water Pollution',
          'Air Pollution',
          'Conservation of Water',
          'Conservation of Soil',
        ],
      },
      {
        name: 'Social Surroundings',
        subtopics: [
          'Superlatives of India',
          'States and Capitals',
          'National Symbols',
          'Different Landscapes',
          'Festivals',
          'Seasons',
          'Forests',
          'Crops',
          'Clothes and Fibres',
        ],
      },
    ],
  },
  {
    name: 'Arithmetic / Mathematics',
    code: 'MATH',
    questionCount: 20,
    icon: 'calculate',
    topics: [
      {
        name: 'Number and Numeric System',
        subtopics: [
          'Ascending Order',
          'Descending Order',
          'Nearest 10',
          'Nearest 100',
          'Nearest 1000',
          'Number Names',
          'Value',
        ],
      },
      {
        name: 'Four Fundamental Operations on Whole Numbers',
        subtopics: ['Addition', 'Subtraction', 'Multiplication', 'Division'],
      },
      {
        name: 'Factors and Multiples',
        subtopics: ['Factors', 'Multiples', 'Properties of Factors and Multiples'],
      },
      {
        name: 'Fractions and Fundamental Operations',
        subtopics: [
          'Addition of Like Fractions',
          'Subtraction of Like Fractions',
          'Multiplication of Fractions',
        ],
      },
      {
        name: 'Measurement and Unit Conversion',
        subtopics: [
          'Measurement of Length',
          'Measurement of Mass',
          'Measurement of Capacity',
          'Measurement of Time',
          'Measurement of Money',
          'Unit Conversion',
        ],
      },
      {
        name: 'Simplification of Numerical Expressions',
        subtopics: ['Simplification of Numerical Expressions'],
      },
      {
        name: 'Perimeter and Area',
        subtopics: [
          'Perimeter of Polygons',
          'Area of Square',
          'Area of Rectangle',
          'Area of Triangle (Triangle as a part of a Rectangle)',
        ],
      },
      {
        name: 'Types of Angles and Their Simple Applications',
        subtopics: [
          'Types of Angles',
          'Simple Applications of Angles',
          'Directions',
          'Mapping',
        ],
      },
      {
        name: 'Data Analysis',
        subtopics: ['Bar Diagrams', 'Tables', 'Pictographs'],
      },
    ],
  },
  {
    name: 'Language Test',
    code: 'LANG',
    questionCount: 20,
    icon: 'menu_book',
    topics: [
      {
        name: 'Reading Comprehension – Passage 1',
        subtopics: [
          'Read the passage',
          'Understand the passage',
          'Answer questions based on the passage',
        ],
      },
      {
        name: 'Reading Comprehension – Passage 2',
        subtopics: [
          'Read the passage',
          'Understand the passage',
          'Answer questions based on the passage',
        ],
      },
      {
        name: 'Reading Comprehension – Passage 3',
        subtopics: [
          'Read the passage',
          'Understand the passage',
          'Answer questions based on the passage',
        ],
      },
      {
        name: 'Reading Comprehension – Passage 4',
        subtopics: [
          'Read the passage',
          'Understand the passage',
          'Answer questions based on the passage',
        ],
      },
    ],
  },
];

export function getTopicsForSubject(subjectName: string): string[] {
  const matched = SYLLABUS_DATA.find(
    (s) => s.name.toLowerCase() === subjectName.toLowerCase() || subjectName.toLowerCase().includes(s.code.toLowerCase())
  );
  if (matched) {
    return matched.topics.map((t) => t.name);
  }
  return SYLLABUS_DATA[0].topics.map((t) => t.name);
}

export function getSubtopicsForTopic(subjectName: string, topicName: string): string[] {
  const matchedSub = SYLLABUS_DATA.find(
    (s) => s.name.toLowerCase() === subjectName.toLowerCase() || subjectName.toLowerCase().includes(s.code.toLowerCase())
  );
  if (matchedSub) {
    const matchedTop = matchedSub.topics.find((t) => t.name.toLowerCase() === topicName.toLowerCase());
    if (matchedTop) {
      return matchedTop.subtopics;
    }
  }
  return ['General Concepts', 'Exam Pattern Questions'];
}

export function generateInitialTaxonomy(): TaxonomyItem[] {
  const items: TaxonomyItem[] = [];
  let idCounter = 1;

  SYLLABUS_DATA.forEach((subj) => {
    items.push({
      id: `tax_${idCounter++}`,
      type: 'Subject',
      name: subj.name,
      questionCount: subj.topics.reduce((acc, t) => acc + t.subtopics.length * 15, 0),
    });

    subj.topics.forEach((topic) => {
      items.push({
        id: `tax_${idCounter++}`,
        type: 'Topic',
        name: topic.name,
        parentName: subj.name,
      });

      topic.subtopics.forEach((subtopic) => {
        items.push({
          id: `tax_${idCounter++}`,
          type: 'Subtopic',
          name: subtopic,
          parentName: topic.name,
        });
      });
    });
  });

  return items;
}
