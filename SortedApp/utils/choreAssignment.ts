export type AssignmentLoad = {
  count: number;
  points: number;
};

type AssignmentChore = {
  assignedTo: string | null;
  status: string;
  points: number;
};

export const isPendingStatus = (status: string | undefined | null) =>
  status === 'pending' || status === 'overdue';

export const buildAssignmentLoad = (chores: AssignmentChore[]) => {
  const loadMap = new Map<string, AssignmentLoad>();

  chores.forEach((chore) => {
    if (!chore.assignedTo || !isPendingStatus(chore.status)) {
      return;
    }

    const points = Number.isFinite(chore.points) ? chore.points : 0;
    const current = loadMap.get(chore.assignedTo) ?? { count: 0, points: 0 };
    loadMap.set(chore.assignedTo, {
      count: current.count + 1,
      points: current.points + points,
    });
  });

  return loadMap;
};

export const adjustAssignmentLoad = (
  loadMap: Map<string, AssignmentLoad>,
  userId: string | null,
  deltaCount: number,
  deltaPoints: number
) => {
  if (!userId) return;
  const current = loadMap.get(userId) ?? { count: 0, points: 0 };
  const nextCount = Math.max(0, current.count + deltaCount);
  const nextPoints = Math.max(0, current.points + deltaPoints);

  if (nextCount === 0 && nextPoints === 0) {
    loadMap.delete(userId);
    return;
  }

  loadMap.set(userId, { count: nextCount, points: nextPoints });
};

export const selectFairAssignee = (
  members: string[],
  pointsMap: Map<string, number>,
  assignmentLoad: Map<string, AssignmentLoad>,
  excludeUserId?: string | null
) => {
  const available = members.filter((memberId) => memberId !== excludeUserId);
  const pool = available.length ? available : members;
  if (!pool.length) {
    return null;
  }

  return [...pool].sort((a, b) => {
    const pointsA = pointsMap.get(a) ?? 0;
    const pointsB = pointsMap.get(b) ?? 0;
    const loadA = assignmentLoad.get(a) ?? { count: 0, points: 0 };
    const loadB = assignmentLoad.get(b) ?? { count: 0, points: 0 };

    const scoreA = pointsA + loadA.points;
    const scoreB = pointsB + loadB.points;
    if (scoreA !== scoreB) {
      return scoreA - scoreB;
    }

    if (loadA.points !== loadB.points) {
      return loadA.points - loadB.points;
    }
    if (loadA.count !== loadB.count) {
      return loadA.count - loadB.count;
    }
    return a.localeCompare(b);
  })[0];
};
