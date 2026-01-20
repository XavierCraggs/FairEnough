import {
  adjustAssignmentLoad,
  buildAssignmentLoad,
  selectFairAssignee,
} from '../utils/choreAssignment';

describe('chore assignment fairness', () => {
  it('picks the member with fewer rolling points', () => {
    const members = ['alice', 'bob'];
    const pointsMap = new Map([
      ['alice', 6],
      ['bob', 3],
    ]);
    const assignmentLoad = buildAssignmentLoad([]);

    expect(selectFairAssignee(members, pointsMap, assignmentLoad, null)).toBe('bob');
  });

  it('breaks ties using pending assignment points', () => {
    const members = ['alice', 'bob'];
    const pointsMap = new Map([
      ['alice', 5],
      ['bob', 5],
    ]);
    const assignmentLoad = buildAssignmentLoad([
      { assignedTo: 'alice', status: 'pending', points: 6 },
      { assignedTo: 'bob', status: 'pending', points: 2 },
    ]);

    expect(selectFairAssignee(members, pointsMap, assignmentLoad, null)).toBe('bob');
  });

  it('prefers lighter pending workload even if rolling points are higher', () => {
    const members = ['alice', 'bob'];
    const pointsMap = new Map([
      ['alice', 2],
      ['bob', 6],
    ]);
    const assignmentLoad = buildAssignmentLoad([
      { assignedTo: 'alice', status: 'pending', points: 8 },
    ]);

    expect(selectFairAssignee(members, pointsMap, assignmentLoad, null)).toBe('bob');
  });

  it('weights pending chores by points, not just count', () => {
    const members = ['alice', 'bob'];
    const pointsMap = new Map([
      ['alice', 4],
      ['bob', 4],
    ]);
    const assignmentLoad = buildAssignmentLoad([
      { assignedTo: 'alice', status: 'pending', points: 8 },
      { assignedTo: 'bob', status: 'pending', points: 2 },
      { assignedTo: 'bob', status: 'pending', points: 2 },
    ]);

    expect(selectFairAssignee(members, pointsMap, assignmentLoad, null)).toBe('bob');
  });

  it('breaks ties using pending assignment count when points are equal', () => {
    const members = ['alice', 'bob'];
    const pointsMap = new Map([
      ['alice', 4],
      ['bob', 4],
    ]);
    const assignmentLoad = buildAssignmentLoad([
      { assignedTo: 'alice', status: 'pending', points: 1 },
      { assignedTo: 'alice', status: 'pending', points: 1 },
      { assignedTo: 'bob', status: 'pending', points: 2 },
    ]);

    expect(selectFairAssignee(members, pointsMap, assignmentLoad, null)).toBe('bob');
  });

  it('ignores completed chores when building load', () => {
    const assignmentLoad = buildAssignmentLoad([
      { assignedTo: 'alice', status: 'completed', points: 5 },
      { assignedTo: 'alice', status: 'pending', points: 2 },
    ]);

    expect(assignmentLoad.get('alice')).toEqual({ count: 1, points: 2 });
  });

  it('updates load when assignments change', () => {
    const assignmentLoad = buildAssignmentLoad([
      { assignedTo: 'alice', status: 'pending', points: 3 },
    ]);

    adjustAssignmentLoad(assignmentLoad, 'alice', -1, -3);
    adjustAssignmentLoad(assignmentLoad, 'bob', 1, 3);

    expect(assignmentLoad.get('alice')).toBeUndefined();
    expect(assignmentLoad.get('bob')).toEqual({ count: 1, points: 3 });
  });

  const simulateAssignments = (
    members: string[],
    pointsMap: Map<string, number>,
    existingChores: Array<{ assignedTo: string | null; status: string; points: number }>,
    dueChores: Array<{ points: number; exclude?: string | null }>
  ) => {
    const assignmentLoad = buildAssignmentLoad(existingChores);
    const assignments: string[] = [];

    dueChores.forEach((chore) => {
      const target = selectFairAssignee(
        members,
        pointsMap,
        assignmentLoad,
        chore.exclude ?? null
      );
      assignments.push(target ?? 'none');
      if (target) {
        adjustAssignmentLoad(assignmentLoad, target, 1, chore.points);
      }
    });

    return assignments;
  };

  it('balances multiple due chores against current pending workload', () => {
    const members = ['alice', 'bob', 'charlie'];
    const pointsMap = new Map([
      ['alice', 2],
      ['bob', 4],
      ['charlie', 6],
    ]);
    const existing = [
      { assignedTo: 'alice', status: 'pending', points: 8 },
      { assignedTo: 'charlie', status: 'pending', points: 2 },
    ];
    const dueChores = [{ points: 5 }, { points: 3 }, { points: 2 }];

    expect(simulateAssignments(members, pointsMap, existing, dueChores)).toEqual([
      'bob',
      'charlie',
      'bob',
    ]);
  });

  it('spreads assignments when scores stay close', () => {
    const members = ['alice', 'bob', 'charlie'];
    const pointsMap = new Map([
      ['alice', 3],
      ['bob', 3],
      ['charlie', 3],
    ]);
    const existing = [
      { assignedTo: 'alice', status: 'pending', points: 2 },
    ];
    const dueChores = [{ points: 4 }, { points: 4 }, { points: 4 }];

    expect(simulateAssignments(members, pointsMap, existing, dueChores)).toEqual([
      'bob',
      'charlie',
      'alice',
    ]);
  });
});
